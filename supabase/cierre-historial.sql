-- Ejecutar después de editar-eliminar-pedidos.sql.
begin;
create table if not exists public.day_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_date date not null,
  closed_at timestamptz not null default now(),
  menu_snapshot jsonb not null default '[]',
  sales_snapshot jsonb not null default '[]',
  unique(user_id,business_date)
);
alter table public.day_closures enable row level security;
drop policy if exists "Leer cierres propios" on public.day_closures;
create policy "Leer cierres propios" on public.day_closures for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Crear cierres propios" on public.day_closures;
create policy "Crear cierres propios" on public.day_closures for insert to authenticated with check (auth.uid() = user_id);
grant select,insert on public.day_closures to authenticated;
alter table public.sales add column if not exists closed_day date;

create or replace function public.lock_business_day() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' ||
      (now() at time zone 'America/Argentina/Buenos_Aires')::date::text, 0));
  end if;
  return null;
end $$;
drop trigger if exists lock_sales_day on public.sales;
create trigger lock_sales_day before insert or update or delete on public.sales for each statement execute function public.lock_business_day();
drop trigger if exists lock_menu_day on public.daily_menu;
create trigger lock_menu_day before insert or update or delete on public.daily_menu for each statement execute function public.lock_business_day();

create or replace function public.guard_closed_day() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date; owner_id uuid;
begin
  if tg_op = 'DELETE' then owner_id := old.user_id; else owner_id := new.user_id; end if;
  if tg_table_name = 'sales' then
    if tg_op <> 'INSERT' and old.closed_day is not null then raise exception 'El pedido pertenece a un día cerrado. Consultalo en Historial.'; end if;
    if tg_op <> 'DELETE' and new.closed_day is not null then
      if tg_op = 'UPDATE' and new.closed_day = today and new.payment_status = 'pagado'
        -- total es GENERATED: todavía no está calculado en un BEFORE UPDATE.
        -- Comparar solo las columnas base para permitir archivar sin alterar la venta.
        and row(new.id,new.user_id,new.dish_id,new.quantity,new.unit_price,new.payment_method,
          new.status,new.created_at,new.table_reference,new.payment_status,new.paid_at,new.order_id,new.order_revision)
          is not distinct from
          row(old.id,old.user_id,old.dish_id,old.quantity,old.unit_price,old.payment_method,
          old.status,old.created_at,old.table_reference,old.payment_status,old.paid_at,old.order_id,old.order_revision)
        and exists(select 1 from public.day_closures where user_id = owner_id and business_date = today) then return new; end if;
      raise exception 'No se puede archivar este pedido.';
    end if;
  end if;
  if exists(select 1 from public.day_closures where user_id = owner_id and business_date = today) then
    if tg_table_name = 'daily_menu' and tg_op = 'UPDATE' then
      if new.is_available = false and (to_jsonb(new) - 'is_available') = (to_jsonb(old) - 'is_available') then return new; end if;
    end if;
    raise exception 'El día ya terminó. Podrás cargar el nuevo menú mañana.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists guard_sales_closed on public.sales;
create trigger guard_sales_closed before insert or update or delete on public.sales for each row execute function public.guard_closed_day();
drop trigger if exists guard_menu_closed on public.daily_menu;
create trigger guard_menu_closed before insert or update or delete on public.daily_menu for each row execute function public.guard_closed_day();

-- Impide insertar un cierre falso o saltear la comprobación llamando a la tabla directamente.
create or replace function public.prepare_day_closure() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null or new.user_id <> auth.uid() or new.business_date <> today then
    raise exception 'Solo podés terminar tu día actual.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || today::text,0));
  if exists(select 1 from public.sales where user_id=auth.uid() and status='vigente' and payment_status='pendiente') then
    raise exception 'Todavía hay pedidos pendientes. Cobralos o eliminá los incorrectos antes de terminar el día.';
  end if;
  new.closed_at := now();
  select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('name',d.name,'price',d.price)), '[]'::jsonb)
    into new.menu_snapshot from public.daily_menu m join public.dishes d on d.id=m.dish_id and d.user_id=m.user_id
    where m.user_id=auth.uid() and m.menu_date=today and m.is_available;
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('dishes',jsonb_build_object('name',d.name))), '[]'::jsonb)
    into new.sales_snapshot from public.sales s join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id
    where s.user_id=auth.uid() and s.status='vigente' and s.payment_status='pagado' and s.closed_day is null
      and (s.paid_at at time zone 'America/Argentina/Buenos_Aires')::date <= today;
  return new;
end $$;
drop trigger if exists prepare_closure on public.day_closures;
create trigger prepare_closure before insert on public.day_closures for each row execute function public.prepare_day_closure();

create or replace function public.close_day(p_date date) returns public.day_closures
language plpgsql security invoker set search_path = '' as $$
declare result public.day_closures; today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date; menus jsonb; sales jsonb;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_date is null or p_date <> today then raise exception 'Solo podés terminar el día de hoy.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || today::text,0));
  select * into result from public.day_closures where user_id = auth.uid() and business_date = today;
  if found then return result; end if;
  if exists(select 1 from public.sales where user_id = auth.uid() and status = 'vigente' and payment_status = 'pendiente') then
    raise exception 'Todavía hay pedidos pendientes. Cobralos o eliminá los incorrectos antes de terminar el día.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('name',d.name,'price',d.price)), '[]'::jsonb)
    into menus from public.daily_menu m join public.dishes d on d.id=m.dish_id and d.user_id=m.user_id
    where m.user_id=auth.uid() and m.menu_date=today and m.is_available;
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('dishes',jsonb_build_object('name',d.name))), '[]'::jsonb)
    into sales from public.sales s join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id
    where s.user_id=auth.uid() and s.status='vigente' and s.payment_status='pagado' and s.closed_day is null
      and (s.paid_at at time zone 'America/Argentina/Buenos_Aires')::date <= today;
  insert into public.day_closures(user_id,business_date,menu_snapshot,sales_snapshot)
    values(auth.uid(),today,menus,sales) returning * into result;
  update public.sales set closed_day=today where user_id=auth.uid() and status='vigente' and payment_status='pagado'
    and closed_day is null and (paid_at at time zone 'America/Argentina/Buenos_Aires')::date <= today;
  update public.daily_menu set is_available=false where user_id=auth.uid() and menu_date=today and is_available;
  return result;
end $$;
revoke all on function public.close_day(date) from public,anon;
grant execute on function public.close_day(date) to authenticated;
commit;
