-- Ejecutar después de local-compartido.sql y mejoras-operacion.sql. Se puede repetir.
begin;

create table if not exists public.daily_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.local_owner_id() references auth.users(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  business_date date not null,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('efectivo','transferencia')),
  created_at timestamptz not null default now()
);
create index if not exists daily_expenses_day_idx on public.daily_expenses(user_id,business_date,created_at desc);
alter table public.daily_expenses enable row level security;
drop policy if exists daily_expenses_read on public.daily_expenses;
create policy daily_expenses_read on public.daily_expenses for select to authenticated
  using (auth.uid() is not null and user_id=public.local_owner_id());
revoke all on public.daily_expenses from public,anon,authenticated;
grant select on public.daily_expenses to authenticated;

alter table public.day_closures add column if not exists expenses_snapshot jsonb not null default '[]'::jsonb;

create or replace function public.add_daily_expense(p_date date,p_description text,p_amount numeric,p_method text)
returns public.daily_expenses language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.local_owner_id(); result public.daily_expenses;
begin
  if auth.uid() is null or owner is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_date is null or p_date<>(now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Solo podés registrar gastos del día actual.';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 1 and 120 then
    raise exception 'Escribí un concepto de hasta 120 caracteres.';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Ingresá un importe positivo con hasta dos decimales.';
  end if;
  if p_method is null or p_method not in ('efectivo','transferencia') then
    raise exception 'Elegí efectivo o transferencia.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||p_date::text,0));
  if exists(select 1 from public.day_closures where user_id=owner and business_date=p_date) then
    raise exception 'El día ya terminó. No podés agregar gastos.';
  end if;
  insert into public.daily_expenses(user_id,created_by,business_date,description,amount,payment_method)
    values(owner,auth.uid(),p_date,btrim(p_description),p_amount,p_method) returning * into result;
  return result;
end $$;

create or replace function public.delete_daily_expense(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.local_owner_id(); expense_day date;
begin
  if auth.uid() is null or owner is null then raise exception 'Iniciá sesión para continuar.'; end if;
  select business_date into expense_day from public.daily_expenses where id=p_id and user_id=owner;
  if expense_day is null then raise exception 'No se encontró el gasto.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||expense_day::text,0));
  if expense_day<>(now() at time zone 'America/Argentina/Buenos_Aires')::date or
    exists(select 1 from public.day_closures where user_id=owner and business_date=expense_day) then
    raise exception 'El día ya terminó. No podés eliminar gastos.';
  end if;
  delete from public.daily_expenses where id=p_id and user_id=owner and business_date=expense_day;
  if not found then raise exception 'No se encontró el gasto.'; end if;
end $$;

-- Un trigger adicional guarda los gastos sin modificar el cierre ya instalado.
create or replace function public.snapshot_day_expenses() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]'::jsonb)
    into new.expenses_snapshot from public.daily_expenses e
    where e.user_id=new.user_id and e.business_date=new.business_date;
  return new;
end $$;
drop trigger if exists snapshot_day_expenses on public.day_closures;
create trigger snapshot_day_expenses before insert on public.day_closures
  for each row execute function public.snapshot_day_expenses();

revoke all on function public.add_daily_expense(date,text,numeric,text) from public,anon;
revoke all on function public.delete_daily_expense(uuid) from public,anon;
grant execute on function public.add_daily_expense(date,text,numeric,text) to authenticated;
grant execute on function public.delete_daily_expense(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
