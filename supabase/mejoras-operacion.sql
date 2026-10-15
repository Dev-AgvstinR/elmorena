-- Ejecutar después de local-compartido.sql. Se puede volver a ejecutar.
begin;

-- Repara exclusivamente el estado que podía dejar la versión anterior de
-- local-compartido: cierre de hoy coexistiendo con pedidos pendientes.
-- Se conserva una copia íntegra del cierre antes de devolver el día a activo.
lock table public.sales,public.day_closures,public.daily_menu in access exclusive mode;
create table if not exists public.closure_recovery_archive (
  id uuid primary key default gen_random_uuid(),
  closure_snapshot jsonb not null,
  recovered_at timestamptz not null default now()
);
alter table public.closure_recovery_archive enable row level security;
revoke all on public.closure_recovery_archive from anon,authenticated;
do $$
declare today date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
  closed public.day_closures; guard_state "char";
begin
  select * into closed from public.day_closures where business_date=today;
  if found and exists(select 1 from public.sales where status='vigente' and payment_status='pendiente') then
    select tgenabled into guard_state from pg_trigger where tgrelid='public.sales'::regclass and tgname='guard_sales_closed';
    if guard_state is null then raise exception 'Falta el control de cierre. Revisá las migraciones anteriores.'; end if;
    insert into public.closure_recovery_archive(closure_snapshot) values(to_jsonb(closed));
    delete from public.day_closures where id=closed.id;
    alter table public.sales disable trigger guard_sales_closed;
    update public.sales set closed_day=null where closed_day=today;
    -- Valida los pagos diferidos antes de volver a modificar el estado del trigger.
    set constraints all immediate;
    execute 'alter table public.sales '||case guard_state when 'D' then 'disable' when 'A' then 'enable always' when 'R' then 'enable replica' else 'enable' end||' trigger guard_sales_closed';
    insert into public.daily_menu(user_id,menu_date,dish_id,is_available)
      select distinct closed.user_id,today,d.id,true
      from jsonb_array_elements(closed.menu_snapshot) item
      join public.dishes d on d.id=(item->>'dish_id')::uuid and d.is_active
      on conflict(user_id,menu_date,dish_id) do update set is_available=true;
  end if;
end $$;

-- Resumen calculado sobre todas las ventas, independiente del límite de filas API.
create or replace function public.sales_summary(p_date date) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'plates',coalesce(sum(quantity) filter(where beverage_id is null),0),
    'beverages',coalesce(sum(quantity) filter(where beverage_id is not null),0),
    'cashCents',coalesce(sum(cash_amount)*100,0),
    'transferCents',coalesce(sum(transfer_amount)*100,0),
    'totalCents',coalesce(sum(total)*100,0)
  ) from public.sales
  where user_id=public.local_owner_id() and status='vigente' and payment_status='pagado'
    and closed_day is null and paid_at >= (p_date::timestamp at time zone 'America/Argentina/Buenos_Aires')
    and paid_at < ((p_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
$$;

-- Pagina por PEDIDO, para no cortar sus productos entre dos páginas.
create or replace function public.sales_page(p_date date,p_state text,p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_state is null or p_state not in ('pagado','pendiente') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Página de pedidos inválida.';
  end if;
  with eligible as materialized (
    select s.* from public.sales s where user_id=public.local_owner_id() and status='vigente' and payment_status=p_state
      and (p_state='pendiente' or (closed_day is null
        and paid_at >= (p_date::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and paid_at < ((p_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')))
  ), ordered as (
    select coalesce(order_id,id) as order_key,min(created_at) as created
    from eligible group by coalesce(order_id,id)
    order by min(created_at) desc,coalesce(order_id,id) desc offset p_offset limit p_limit+1
  ), page as (
    select * from ordered order by created desc,order_key desc limit p_limit
  )
  select jsonb_build_object('hasMore',(select count(*)>p_limit from ordered),'items',coalesce((
    select jsonb_agg(to_jsonb(s)||jsonb_build_object(
      'dishes',case when d.id is not null then jsonb_build_object('name',d.name) else null end,
      'beverages',case when b.id is not null then jsonb_build_object('name',b.name) else null end
    ) order by p.created desc,p.order_key desc,s.id)
    from page p join eligible s on coalesce(s.order_id,s.id)=p.order_key
    left join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id
    left join public.beverages b on b.id=s.beverage_id and b.user_id=s.user_id
  ),'[]'::jsonb)) into result;
  return result;
end $$;

-- Comparación y escritura dentro del mismo bloqueo compartido con pedidos/cierre.
create or replace function public.save_daily_menu(p_date date,p_dish_ids uuid[],p_expected_ids uuid[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare owner uuid:=public.local_owner_id(); current_ids uuid[]; desired_ids uuid[]; expected_ids uuid[];
begin
  if owner is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_date is null or p_date<>(now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Cambió el día. Volvé a abrir el menú.';
  end if;
  if coalesce(cardinality(p_dish_ids),0)=0 or p_expected_ids is null then raise exception 'Elegí al menos una comida.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||p_date::text,0));
  if exists(select 1 from public.day_closures where user_id=owner and business_date=p_date) then
    raise exception 'El día ya terminó. Podrás armar el menú mañana.';
  end if;
  select array_agg(id order by id) into desired_ids from (select distinct unnest(p_dish_ids) id) x;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into expected_ids from (select distinct unnest(p_expected_ids) id) x;
  select coalesce(array_agg(dish_id order by dish_id),'{}'::uuid[]) into current_ids
    from public.daily_menu where user_id=owner and menu_date=p_date and is_available;
  if current_ids<>expected_ids and current_ids<>desired_ids then
    raise exception 'El menú cambió en otra cuenta. Cerrá y volvé a abrir el menú antes de guardar.' using errcode='40001';
  end if;
  if exists(select 1 from unnest(desired_ids) as x(id) where not exists(
    select 1 from public.dishes d where d.id=x.id and d.user_id=owner and d.is_active
  )) then raise exception 'Una comida ya no está disponible. Actualizá el menú.'; end if;
  update public.daily_menu set is_available=false
    where user_id=owner and menu_date=p_date and is_available and not(dish_id=any(desired_ids));
  insert into public.daily_menu(user_id,menu_date,dish_id,is_available)
    select owner,p_date,id,true from unnest(desired_ids) id
    on conflict(user_id,menu_date,dish_id) do update set is_available=true;
  return (select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.daily_menu m where user_id=owner and menu_date=p_date);
end $$;

revoke all on function public.sales_summary(date) from public,anon;
revoke all on function public.sales_page(date,text,integer,integer) from public,anon;
revoke all on function public.save_daily_menu(date,uuid[],uuid[]) from public,anon;
grant execute on function public.sales_summary(date) to authenticated;
grant execute on function public.sales_page(date,text,integer,integer) to authenticated;
grant execute on function public.save_daily_menu(date,uuid[],uuid[]) to authenticated;

create index if not exists sales_open_paid_day_idx on public.sales(user_id,paid_at)
where status='vigente' and payment_status='pagado' and closed_day is null;
create index if not exists sales_pending_created_idx on public.sales(user_id,created_at)
where status='vigente' and payment_status='pendiente';

notify pgrst,'reload schema';
commit;
