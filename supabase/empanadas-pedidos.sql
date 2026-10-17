-- Ejecutar después de pago-combinado.sql y local-compartido.sql.
-- Agrega empanadas por unidad/media docena/docena y su modalidad para llevar o comer en el local.
begin;

create table if not exists public.empanada_prices (
  user_id uuid not null default public.local_owner_id(),
  flavor text not null check (flavor in ('carne','pollo')),
  price_1 numeric(12,2) not null default 0 check (price_1 >= 0),
  price_6 numeric(12,2) not null default 0 check (price_6 >= 0),
  price_12 numeric(12,2) not null default 0 check (price_12 >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,flavor)
);
-- La media docena siempre vale exactamente la mitad de la docena.
create or replace function public.sync_empanada_half_dozen_price() returns trigger
language plpgsql security invoker set search_path = '' as $body$
begin
  new.price_6 := round(new.price_12 / 2, 2);
  return new;
end
$body$;
drop trigger if exists set_empanada_half_dozen_price on public.empanada_prices;
create trigger set_empanada_half_dozen_price
before insert or update on public.empanada_prices
for each row execute function public.sync_empanada_half_dozen_price();
update public.empanada_prices
set price_6 = round(price_12 / 2, 2)
where price_6 is distinct from round(price_12 / 2, 2);
alter table public.empanada_prices enable row level security;
drop policy if exists empanada_prices_read on public.empanada_prices;
drop policy if exists empanada_prices_write on public.empanada_prices;
create policy empanada_prices_read on public.empanada_prices for select to authenticated using(user_id=public.local_owner_id());
create policy empanada_prices_write on public.empanada_prices for all to authenticated using(user_id=public.local_owner_id()) with check(user_id=public.local_owner_id());
grant select,insert,update on public.empanada_prices to authenticated;
insert into public.empanada_prices(user_id,flavor)
select settings.owner_id,flavors.flavor from public.local_settings settings cross join unnest(array['carne','pollo']::text[]) as flavors(flavor) where settings.id
on conflict(user_id,flavor) do nothing;

alter table public.sales add column if not exists empanada_flavor text;
alter table public.sales add column if not exists empanada_pack_size integer;
alter table public.sales add column if not exists service_type text;
alter table public.sales drop constraint if exists sales_one_product_check;
alter table public.sales add constraint sales_one_product_check check (
  num_nonnulls(dish_id,beverage_id,empanada_flavor)=1
  and ((empanada_flavor is null and empanada_pack_size is null)
    or (empanada_flavor in ('carne','pollo') and empanada_pack_size is not null and empanada_pack_size in (1,6,12)))
);
alter table public.sales drop constraint if exists sales_service_type_check;
alter table public.sales add constraint sales_service_type_check check(service_type is null or service_type in ('llevar','local'));
alter table public.sales drop constraint if exists sales_empanada_service_check;
alter table public.sales add constraint sales_empanada_service_check check(empanada_flavor is null or service_type is not null);

create or replace function public.validate_order_products(p_items jsonb) returns void
language plpgsql security invoker set search_path = '' as $body$
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Agregá comidas, bebidas o empanadas al pedido.'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Elegí entre 1 y 100 productos.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(dish_id uuid,beverage_id uuid,empanada_flavor text,empanada_pack_size integer,quantity numeric)
    where num_nonnulls(dish_id,beverage_id,empanada_flavor)<>1 or quantity is null or quantity<1 or quantity>10000 or quantity<>trunc(quantity)
      or (empanada_flavor is null and empanada_pack_size is not null)
      or (empanada_flavor is not null and (empanada_flavor not in ('carne','pollo') or empanada_pack_size is null or empanada_pack_size not in (1,6,12)))) then
    raise exception 'Elegí un producto por línea y cantidades válidas.';
  end if;
end $body$;

create or replace function public.create_pending_order(p_id uuid,p_items jsonb,p_reference text,p_service_type text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $body$
declare item record; price numeric; owner uuid:=public.local_owner_id(); has_empanadas boolean;
begin
  if auth.uid() is null or owner is null or p_id is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  if exists(select 1 from public.sales where order_id=p_id and user_id=owner) then
    return query select * from public.sales where order_id=p_id and user_id=owner; return;
  end if;
  if p_reference is null or length(trim(p_reference)) not between 1 and 120 then raise exception 'Escribí una referencia válida.'; end if;
  perform public.validate_order_products(p_items);
  select exists(select 1 from jsonb_to_recordset(p_items) as x(empanada_flavor text) where empanada_flavor is not null) into has_empanadas;
  if has_empanadas and (p_service_type is null or p_service_type not in ('llevar','local')) then raise exception 'Elegí para llevar o comer en el lugar.'; end if;
  if not has_empanadas and p_service_type is not null then raise exception 'La modalidad se elige cuando el pedido incluye empanadas.'; end if;
  for item in select dish_id,beverage_id,empanada_flavor,empanada_pack_size,sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(dish_id uuid,beverage_id uuid,empanada_flavor text,empanada_pack_size integer,quantity numeric)
    group by dish_id,beverage_id,empanada_flavor,empanada_pack_size order by beverage_id,dish_id,empanada_flavor,empanada_pack_size
  loop
    if item.quantity>10000 then raise exception 'La cantidad máxima por línea es 10000.'; end if;
    if item.empanada_flavor is not null then
      select case item.empanada_pack_size when 1 then price_1 when 6 then round(price_12 / 2, 2) else price_12 end into price
        from public.empanada_prices where user_id=owner and flavor=item.empanada_flavor;
      if not found or price is null or price<=0 then raise exception 'Configurá el precio de empanadas de % en Stock.',item.empanada_flavor; end if;
    elsif item.beverage_id is not null then
      select b.price into price from public.beverages b where b.id=item.beverage_id and b.user_id=owner and b.is_active;
    else
      select d.price into price from public.dishes d join public.daily_menu m on m.dish_id=d.id and m.user_id=d.user_id
        where d.id=item.dish_id and d.user_id=owner and d.is_active and m.is_available
          and m.menu_date=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
    end if;
    if not found then raise exception 'Un producto ya no está disponible.'; end if;
    insert into public.sales(user_id,order_id,dish_id,beverage_id,empanada_flavor,empanada_pack_size,service_type,quantity,unit_price,table_reference,payment_status)
      values(owner,p_id,item.dish_id,item.beverage_id,item.empanada_flavor,item.empanada_pack_size,
        case when has_empanadas then p_service_type else null end,item.quantity,price,trim(p_reference),'pendiente');
  end loop;
  return query select * from public.sales where order_id=p_id and user_id=owner;
end $body$;

-- Compatibilidad para clientes anteriores que aún no envían la modalidad.
create or replace function public.create_pending_order(p_id uuid,p_items jsonb,p_reference text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $body$
begin
  return query select * from public.create_pending_order(p_id,p_items,p_reference,null::text);
end $body$;

drop function if exists public.edit_order_payment(uuid,jsonb,text,text,integer,text,numeric,numeric);
drop function if exists public.edit_order(uuid,jsonb,text,text,integer,text);
create or replace function public.edit_order(p_id uuid,p_items jsonb,p_reference text,p_method text,p_revision integer,p_state text,p_service_type text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $body$
declare owner uuid:=public.local_owner_id(); header public.sales; line public.sales; item record; price numeric; next_revision integer; has_empanadas boolean;
begin
  if auth.uid() is null or owner is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.sales where user_id=owner and coalesce(order_id,id)=p_id for update;
  select * into header from public.sales where user_id=owner and coalesce(order_id,id)=p_id and status='vigente' order by created_at,id limit 1;
  if not found then raise exception 'El pedido ya fue eliminado.'; end if;
  if p_revision is null or p_state is null or exists(select 1 from public.sales where user_id=owner and coalesce(order_id,id)=p_id
    and status='vigente' and (order_revision<>p_revision or payment_status<>p_state)) then raise exception 'El pedido cambió. Cerrá y volvé a abrir la edición.'; end if;
  if p_reference is null or length(trim(p_reference)) not between 1 and 120 then raise exception 'Escribí una referencia válida.'; end if;
  if header.payment_status='pagado' and (p_method is null or p_method not in ('efectivo','transferencia')) then raise exception 'Elegí un medio de pago.'; end if;
  perform public.validate_order_products(p_items);
  select exists(select 1 from jsonb_to_recordset(p_items) as x(empanada_flavor text) where empanada_flavor is not null) into has_empanadas;
  if has_empanadas and (p_service_type is null or p_service_type not in ('llevar','local')) then raise exception 'Elegí para llevar o comer en el lugar.'; end if;
  if not has_empanadas and p_service_type is not null then raise exception 'La modalidad se elige cuando el pedido incluye empanadas.'; end if;
  next_revision:=header.order_revision+1;
  update public.sales s set status='anulada',order_revision=next_revision where s.user_id=owner and coalesce(s.order_id,s.id)=p_id and s.status='vigente'
    and not exists(select 1 from jsonb_to_recordset(p_items) as x(dish_id uuid,beverage_id uuid,empanada_flavor text,empanada_pack_size integer)
      where x.dish_id is not distinct from s.dish_id and x.beverage_id is not distinct from s.beverage_id
        and x.empanada_flavor is not distinct from s.empanada_flavor and x.empanada_pack_size is not distinct from s.empanada_pack_size);
  for item in select dish_id,beverage_id,empanada_flavor,empanada_pack_size,sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(dish_id uuid,beverage_id uuid,empanada_flavor text,empanada_pack_size integer,quantity numeric)
    group by dish_id,beverage_id,empanada_flavor,empanada_pack_size order by beverage_id,dish_id,empanada_flavor,empanada_pack_size
  loop
    if item.quantity>10000 then raise exception 'La cantidad máxima por línea es 10000.'; end if;
    select * into line from public.sales where user_id=owner and coalesce(order_id,id)=p_id and status='vigente'
      and dish_id is not distinct from item.dish_id and beverage_id is not distinct from item.beverage_id
      and empanada_flavor is not distinct from item.empanada_flavor and empanada_pack_size is not distinct from item.empanada_pack_size order by id limit 1;
    if found then
      update public.sales set quantity=item.quantity,table_reference=trim(p_reference),order_id=p_id,order_revision=next_revision,
        service_type=case when has_empanadas then p_service_type else null end,
        payment_method=case when header.payment_status='pagado' then p_method else null end where id=line.id and user_id=owner;
    else
      if item.empanada_flavor is not null then
        select case item.empanada_pack_size when 1 then price_1 when 6 then round(price_12 / 2, 2) else price_12 end into price
          from public.empanada_prices where user_id=owner and flavor=item.empanada_flavor;
        if not found or price is null or price<=0 then raise exception 'Configurá el precio de empanadas de % en Stock.',item.empanada_flavor; end if;
      elsif item.beverage_id is not null then
        select b.price into price from public.beverages b where b.id=item.beverage_id and b.user_id=owner and b.is_active;
      else
        select d.price into price from public.dishes d join public.daily_menu m on m.dish_id=d.id and m.user_id=d.user_id
          where d.id=item.dish_id and d.user_id=owner and d.is_active and m.is_available and m.menu_date=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
      end if;
      if not found then raise exception 'Un producto nuevo ya no está disponible.'; end if;
      insert into public.sales(user_id,order_id,dish_id,beverage_id,empanada_flavor,empanada_pack_size,service_type,quantity,unit_price,table_reference,payment_status,payment_method,paid_at,created_at,order_revision)
        values(owner,p_id,item.dish_id,item.beverage_id,item.empanada_flavor,item.empanada_pack_size,case when has_empanadas then p_service_type else null end,
          item.quantity,price,trim(p_reference),header.payment_status,case when header.payment_status='pagado' then p_method else null end,header.paid_at,header.created_at,next_revision);
    end if;
  end loop;
  update public.sales set service_type=case when has_empanadas then p_service_type else null end
    where user_id=owner and coalesce(order_id,id)=p_id and status='vigente';
  return query select * from public.sales where user_id=owner and coalesce(order_id,id)=p_id and status='vigente';
end $body$;

create or replace function public.edit_order_payment(p_id uuid,p_items jsonb,p_reference text,p_method text,p_revision integer,p_state text,p_cash numeric,p_transfer numeric,p_service_type text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $body$
declare owner uuid:=public.local_owner_id(); amount numeric;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_state='pagado' and (p_method is null or p_method not in ('efectivo','transferencia','mixto')) then raise exception 'Elegí un medio de pago.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.edit_order(p_id,p_items,p_reference,case when p_method='mixto' then 'efectivo' else p_method end,p_revision,p_state,p_service_type);
  if p_state='pagado' then
    select sum(total) into amount from public.sales where user_id=owner and coalesce(order_id,id)=p_id and status='vigente';
    perform public.allocate_order_payment(p_id,case when p_method='efectivo' then amount when p_method='transferencia' then 0 else p_cash end,
      case when p_method='transferencia' then amount when p_method='efectivo' then 0 else p_transfer end);
  end if;
  return query select * from public.sales where user_id=owner and coalesce(order_id,id)=p_id and status='vigente';
end $body$;

-- Conserva la edición de pedidos anteriores y evita que una versión vieja borre empanadas.
create or replace function public.edit_order_payment(p_id uuid,p_items jsonb,p_reference text,p_method text,p_revision integer,p_state text,p_cash numeric,p_transfer numeric)
returns setof public.sales language plpgsql security invoker set search_path = '' as $body$
begin
  if exists(select 1 from public.sales where user_id=public.local_owner_id() and coalesce(order_id,id)=p_id and status='vigente' and empanada_flavor is not null) then
    raise exception 'Actualizá la aplicación antes de editar este pedido con empanadas.';
  end if;
  return query select * from public.edit_order_payment(p_id,p_items,p_reference,p_method,p_revision,p_state,p_cash,p_transfer,null::text);
end $body$;

create or replace function public.sales_summary(p_date date) returns jsonb
language sql stable security invoker set search_path='' as $body$
  with day_sales as materialized (
    select * from public.sales where user_id=public.local_owner_id() and status='vigente' and payment_status='pagado' and closed_day is null
      and paid_at >= (p_date::timestamp at time zone 'America/Argentina/Buenos_Aires')
      and paid_at < ((p_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
  )
  select jsonb_build_object(
    'plates',coalesce(sum(quantity) filter(where dish_id is not null),0),
    'empanadas',coalesce(sum(quantity*empanada_pack_size) filter(where empanada_flavor is not null),0),
    'beverages',coalesce(sum(quantity) filter(where beverage_id is not null),0),
    'cashCents',coalesce(sum(cash_amount)*100,0),'transferCents',coalesce(sum(transfer_amount)*100,0),'totalCents',coalesce(sum(total)*100,0),
    'dishQuantities',coalesce((select jsonb_object_agg(items.dish_id::text,items.quantity) from (
      select dish_id,sum(quantity)::integer as quantity from day_sales where dish_id is not null group by dish_id
    ) items),'{}'::jsonb)
  ) from day_sales;
$body$;

create or replace function public.sales_page(p_date date,p_state text,p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $body$
declare result jsonb;
begin
  if p_state is null or p_state not in ('pagado','pendiente') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Página de pedidos inválida.'; end if;
  with eligible as materialized (
    select s.* from public.sales s where user_id=public.local_owner_id() and status='vigente' and payment_status=p_state
      and (p_state='pendiente' or (closed_day is null and paid_at >= (p_date::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and paid_at < ((p_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')))
  ), ordered as (
    select coalesce(order_id,id) order_key,min(created_at) created from eligible group by coalesce(order_id,id)
    order by min(created_at) desc,coalesce(order_id,id) desc offset p_offset limit p_limit+1
  ), page as (select * from ordered order by created desc,order_key desc limit p_limit)
  select jsonb_build_object('hasMore',(select count(*)>p_limit from ordered),'items',coalesce((
    select jsonb_agg(to_jsonb(s)||jsonb_build_object(
      'dishes',case when d.id is not null then jsonb_build_object('name',d.name) else null end,
      'beverages',case when b.id is not null then jsonb_build_object('name',b.name) else null end,
      'empanadas',case when s.empanada_flavor is not null then jsonb_build_object('name','Empanadas de '||s.empanada_flavor,'pack_size',s.empanada_pack_size) else null end
    ) order by p.created desc,p.order_key desc,s.id)
    from page p join eligible s on coalesce(s.order_id,s.id)=p.order_key
    left join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id left join public.beverages b on b.id=s.beverage_id and b.user_id=s.user_id
  ),'[]'::jsonb)) into result;
  return result;
end $body$;

create or replace function public.prepare_day_closure() returns trigger
language plpgsql security invoker set search_path='' as $body$
declare today date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date; owner uuid:=public.local_owner_id();
begin
  if auth.uid() is null or new.user_id<>owner or new.business_date<>today then raise exception 'Solo podés terminar tu día actual.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||today::text,0));
  if exists(select 1 from public.sales where user_id=owner and status='vigente' and payment_status='pendiente') then raise exception 'Todavía hay pedidos pendientes. Cobralos o eliminá los incorrectos antes de terminar el día.'; end if;
  new.closed_at:=now();
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('name',d.name,'price',d.price)),'[]'::jsonb) into new.menu_snapshot
    from public.daily_menu m join public.dishes d on d.id=m.dish_id and d.user_id=m.user_id where m.user_id=owner and m.menu_date=today and m.is_available;
  select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'dishes',case when d.id is not null then jsonb_build_object('name',d.name) else null end,
    'beverages',case when b.id is not null then jsonb_build_object('name',b.name) else null end,
    'empanadas',case when s.empanada_flavor is not null then jsonb_build_object('name','Empanadas de '||s.empanada_flavor,'pack_size',s.empanada_pack_size) else null end
  )),'[]'::jsonb) into new.sales_snapshot from public.sales s
    left join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id left join public.beverages b on b.id=s.beverage_id and b.user_id=s.user_id
    where s.user_id=owner and s.status='vigente' and s.payment_status='pagado' and s.closed_day is null
      and (s.paid_at at time zone 'America/Argentina/Buenos_Aires')::date<=today;
  return new;
end $body$;

create or replace function public.guard_closed_day() returns trigger
language plpgsql security invoker set search_path='' as $body$
declare today date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date; owner uuid;
begin
  if tg_op='DELETE' then owner:=old.user_id; else owner:=new.user_id; end if;
  if tg_table_name='sales' then
    if tg_op<>'INSERT' and old.closed_day is not null then raise exception 'El pedido pertenece a un día cerrado. Consultalo en Historial.'; end if;
    if tg_op<>'DELETE' and new.closed_day is not null then
      if tg_op='UPDATE' and new.closed_day=today and new.payment_status='pagado'
        and row(new.id,new.user_id,new.dish_id,new.quantity,new.unit_price,new.payment_method,new.status,new.created_at,new.table_reference,new.payment_status,new.paid_at,new.order_id,new.order_revision,new.beverage_id,new.cash_amount,new.transfer_amount,new.empanada_flavor,new.empanada_pack_size,new.service_type)
          is not distinct from row(old.id,old.user_id,old.dish_id,old.quantity,old.unit_price,old.payment_method,old.status,old.created_at,old.table_reference,old.payment_status,old.paid_at,old.order_id,old.order_revision,old.beverage_id,old.cash_amount,old.transfer_amount,old.empanada_flavor,old.empanada_pack_size,old.service_type)
        and exists(select 1 from public.day_closures where user_id=owner and business_date=today) then return new; end if;
      raise exception 'No se puede archivar este pedido.';
    end if;
  end if;
  if exists(select 1 from public.day_closures where user_id=owner and business_date=today) then
    if tg_table_name='daily_menu' and tg_op='UPDATE' and new.is_available=false and (to_jsonb(new)-'is_available')=(to_jsonb(old)-'is_available') then return new; end if;
    raise exception 'El día ya terminó. Podrás cargar el nuevo menú mañana.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $body$;

revoke all on function public.validate_order_products(jsonb) from public,anon;
revoke all on function public.create_pending_order(uuid,jsonb,text,text) from public,anon;
revoke all on function public.create_pending_order(uuid,jsonb,text) from public,anon;
revoke all on function public.edit_order(uuid,jsonb,text,text,integer,text,text) from public,anon;
revoke all on function public.edit_order_payment(uuid,jsonb,text,text,integer,text,numeric,numeric,text) from public,anon;
revoke all on function public.edit_order_payment(uuid,jsonb,text,text,integer,text,numeric,numeric) from public,anon;
revoke all on function public.sales_summary(date) from public,anon;
revoke all on function public.sales_page(date,text,integer,integer) from public,anon;
grant execute on function public.validate_order_products(jsonb) to authenticated;
grant execute on function public.create_pending_order(uuid,jsonb,text,text) to authenticated;
grant execute on function public.create_pending_order(uuid,jsonb,text) to authenticated;
grant execute on function public.edit_order(uuid,jsonb,text,text,integer,text,text) to authenticated;
grant execute on function public.edit_order_payment(uuid,jsonb,text,text,integer,text,numeric,numeric,text) to authenticated;
grant execute on function public.edit_order_payment(uuid,jsonb,text,text,integer,text,numeric,numeric) to authenticated;
grant execute on function public.sales_summary(date) to authenticated;
grant execute on function public.sales_page(date,text,integer,integer) to authenticated;

notify pgrst,'reload schema';
commit;
