-- Requiere stock-bebidas.sql, cierre-historial.sql y corregir-cierre-dia.sql.
begin;
do $body$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.beverages'::regclass and conname='beverages_user_id_id_key') then
    alter table public.beverages add constraint beverages_user_id_id_key unique(user_id,id);
  end if;
end $body$;
alter table public.sales alter column dish_id drop not null;
alter table public.sales add column if not exists beverage_id uuid;
do $body$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sales'::regclass and conname='sales_beverage_owner_fk') then
    alter table public.sales add constraint sales_beverage_owner_fk foreign key(user_id,beverage_id) references public.beverages(user_id,id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.sales'::regclass and conname='sales_one_product_check') then
    alter table public.sales add constraint sales_one_product_check check(num_nonnulls(dish_id,beverage_id)=1);
  end if;
end $body$;

-- Reserva unidades al anotar. Restituye la diferencia al reducir o eliminar.
create or replace function public.sync_sale_beverage_stock() returns trigger
language plpgsql security invoker set search_path = '' as $body$
declare old_units integer:=0; new_units integer:=0; beverage uuid; delta integer;
begin
  if tg_op <> 'INSERT' and old.beverage_id is not null and old.status='vigente' then old_units:=old.quantity; end if;
  if tg_op <> 'DELETE' and new.beverage_id is not null and new.status='vigente' then new_units:=new.quantity; end if;
  if tg_op='UPDATE' and old.beverage_id is distinct from new.beverage_id then raise exception 'Quitá el producto y agregá el nuevo para reemplazarlo.'; end if;
  if tg_op='DELETE' then beverage:=old.beverage_id; else beverage:=new.beverage_id; end if;
  delta:=new_units-old_units;
  if beverage is not null and delta<>0 then
    update public.beverages set stock_quantity=stock_quantity-delta
      where id=beverage and user_id=auth.uid() and stock_quantity-delta between 0 and 1000000
        and (delta<0 or is_active);
    if not found then raise exception 'No hay stock suficiente de una bebida, está oculta o se supera el límite de unidades.'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $body$;
drop trigger if exists zz_sale_beverage_stock on public.sales;
create trigger zz_sale_beverage_stock before insert or update or delete on public.sales for each row execute function public.sync_sale_beverage_stock();

create or replace function public.validate_order_products(p_items jsonb) returns void
language plpgsql security invoker set search_path = '' as $body$
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Agregá comidas o bebidas al pedido.'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Elegí entre 1 y 100 productos.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(dish_id uuid,beverage_id uuid,quantity numeric)
    where num_nonnulls(dish_id,beverage_id)<>1 or quantity is null or quantity<1 or quantity>10000 or quantity<>trunc(quantity)) then
    raise exception 'Elegí un producto por línea y cantidades enteras entre 1 y 10000.';
  end if;
end $body$;

create or replace function public.create_pending_order(p_id uuid,p_items jsonb,p_reference text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $body$
declare item record; price numeric;
begin
  if auth.uid() is null or p_id is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  if exists(select 1 from public.sales where order_id=p_id and user_id=auth.uid()) then
    return query select * from public.sales where order_id=p_id and user_id=auth.uid(); return;
  end if;
  if p_reference is null or length(trim(p_reference)) not between 1 and 120 then raise exception 'Escribí una referencia válida.'; end if;
  perform public.validate_order_products(p_items);
  for item in select dish_id,beverage_id,sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(dish_id uuid,beverage_id uuid,quantity numeric)
    group by dish_id,beverage_id order by beverage_id,dish_id
  loop
    if item.quantity>10000 then raise exception 'La cantidad máxima por producto es 10000.'; end if;
    if item.beverage_id is not null then
      select b.price into price from public.beverages b where b.id=item.beverage_id and b.user_id=auth.uid() and b.is_active;
    else
      select d.price into price from public.dishes d join public.daily_menu m on m.dish_id=d.id and m.user_id=d.user_id
        where d.id=item.dish_id and d.user_id=auth.uid() and d.is_active and m.is_available
        and m.menu_date=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
    end if;
    if not found then raise exception 'Un producto ya no está disponible.'; end if;
    insert into public.sales(user_id,order_id,dish_id,beverage_id,quantity,unit_price,table_reference,payment_status)
      values(auth.uid(),p_id,item.dish_id,item.beverage_id,item.quantity,price,trim(p_reference),'pendiente');
  end loop;
  return query select * from public.sales where order_id=p_id and user_id=auth.uid();
end $body$;

create or replace function public.edit_order(p_id uuid,p_items jsonb,p_reference text,p_method text,p_revision integer,p_state text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $body$
declare header public.sales; line public.sales; item record; price numeric; next_revision integer;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id for update;
  select * into header from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente' order by created_at,id limit 1;
  if not found then raise exception 'El pedido ya fue eliminado.'; end if;
  if p_revision is null or p_state is null or exists(select 1 from public.sales where user_id=auth.uid()
    and coalesce(order_id,id)=p_id and status='vigente' and (order_revision<>p_revision or payment_status<>p_state)) then
    raise exception 'El pedido cambió. Cerrá y volvé a abrir la edición.';
  end if;
  if p_reference is null or length(trim(p_reference)) not between 1 and 120 then raise exception 'Escribí una referencia válida.'; end if;
  if header.payment_status='pagado' and (p_method is null or p_method not in ('efectivo','transferencia')) then raise exception 'Elegí un medio de pago.'; end if;
  perform public.validate_order_products(p_items);
  next_revision:=header.order_revision+1;
  -- Retirar líneas ausentes primero libera sus bebidas dentro de la misma transacción.
  update public.sales s set status='anulada',order_revision=next_revision where s.user_id=auth.uid()
    and coalesce(s.order_id,s.id)=p_id and s.status='vigente' and not exists(
      select 1 from jsonb_to_recordset(p_items) as x(dish_id uuid,beverage_id uuid)
      where x.dish_id is not distinct from s.dish_id and x.beverage_id is not distinct from s.beverage_id);
  for item in select dish_id,beverage_id,sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(dish_id uuid,beverage_id uuid,quantity numeric)
    group by dish_id,beverage_id order by beverage_id,dish_id
  loop
    if item.quantity>10000 then raise exception 'La cantidad máxima por producto es 10000.'; end if;
    select * into line from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente'
      and dish_id is not distinct from item.dish_id and beverage_id is not distinct from item.beverage_id order by id limit 1;
    if found then
      update public.sales set quantity=item.quantity,table_reference=trim(p_reference),order_id=p_id,order_revision=next_revision,
        payment_method=case when header.payment_status='pagado' then p_method else null end where id=line.id and user_id=auth.uid();
    else
      if item.beverage_id is not null then
        select b.price into price from public.beverages b where b.id=item.beverage_id and b.user_id=auth.uid() and b.is_active;
      else
        select d.price into price from public.dishes d join public.daily_menu m on m.dish_id=d.id and m.user_id=d.user_id
          where d.id=item.dish_id and d.user_id=auth.uid() and d.is_active and m.is_available
          and m.menu_date=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
      end if;
      if not found then raise exception 'Un producto ya no está disponible.'; end if;
      insert into public.sales(user_id,order_id,dish_id,beverage_id,quantity,unit_price,table_reference,payment_status,payment_method,paid_at,created_at,order_revision)
        values(auth.uid(),p_id,item.dish_id,item.beverage_id,item.quantity,price,trim(p_reference),header.payment_status,
          case when header.payment_status='pagado' then p_method else null end,header.paid_at,header.created_at,next_revision);
    end if;
  end loop;
  return query select * from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente';
end $body$;
-- El trigger de stock también devuelve unidades al anular con delete_order.
revoke all on function public.validate_order_products(jsonb) from public,anon;
grant execute on function public.validate_order_products(jsonb) to authenticated;

-- El cierre también conserva las bebidas en el historial.
create or replace function public.guard_closed_day() returns trigger
language plpgsql security invoker set search_path = '' as $body$
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
          new.status,new.created_at,new.table_reference,new.payment_status,new.paid_at,new.order_id,new.order_revision,new.beverage_id)
          is not distinct from
          row(old.id,old.user_id,old.dish_id,old.quantity,old.unit_price,old.payment_method,
          old.status,old.created_at,old.table_reference,old.payment_status,old.paid_at,old.order_id,old.order_revision,old.beverage_id)
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
end $body$;

create or replace function public.prepare_day_closure() returns trigger
language plpgsql security invoker set search_path = '' as $body$
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
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('dishes',case when d.id is not null then jsonb_build_object('name',d.name) else null end,'beverages',case when b.id is not null then jsonb_build_object('name',b.name) else null end)), '[]'::jsonb)
    into new.sales_snapshot from public.sales s left join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id left join public.beverages b on b.id=s.beverage_id and b.user_id=s.user_id
    where s.user_id=auth.uid() and s.status='vigente' and s.payment_status='pagado' and s.closed_day is null
      and (s.paid_at at time zone 'America/Argentina/Buenos_Aires')::date <= today;
  return new;
end $body$;

create or replace function public.close_day(p_date date) returns public.day_closures
language plpgsql security invoker set search_path = '' as $body$
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
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('dishes',case when d.id is not null then jsonb_build_object('name',d.name) else null end,'beverages',case when b.id is not null then jsonb_build_object('name',b.name) else null end)), '[]'::jsonb)
    into sales from public.sales s left join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id left join public.beverages b on b.id=s.beverage_id and b.user_id=s.user_id
    where s.user_id=auth.uid() and s.status='vigente' and s.payment_status='pagado' and s.closed_day is null
      and (s.paid_at at time zone 'America/Argentina/Buenos_Aires')::date <= today;
  insert into public.day_closures(user_id,business_date,menu_snapshot,sales_snapshot)
    values(auth.uid(),today,menus,sales) returning * into result;
  update public.sales set closed_day=today where user_id=auth.uid() and status='vigente' and payment_status='pagado'
    and closed_day is null and (paid_at at time zone 'America/Argentina/Buenos_Aires')::date <= today;
  update public.daily_menu set is_available=false where user_id=auth.uid() and menu_date=today and is_available;
  return result;
end $body$;


-- Mismo orden de bloqueos al cobrar, eliminar, editar y cerrar el día.
create or replace function public.delete_order(p_id uuid, p_revision integer)
returns void language plpgsql security invoker set search_path = '' as $body$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id for update;
  if p_revision is null or exists(select 1 from public.sales where user_id = auth.uid()
    and coalesce(order_id,id) = p_id and status = 'vigente' and order_revision <> p_revision) then
    raise exception 'El pedido cambió. Actualizá la lista antes de eliminarlo.';
  end if;
  update public.sales set status = 'anulada', order_revision = order_revision + 1
    where user_id = auth.uid() and coalesce(order_id,id) = p_id and status = 'vigente';
end $body$;


create or replace function public.pay_order(p_id uuid, p_method text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $body$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  if p_method is null or p_method not in ('efectivo','transferencia') then raise exception 'Elegí un medio de pago.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id and status = 'vigente' for update;
  if not found then raise exception 'El pedido ya fue eliminado.'; end if;
  if exists(select 1 from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id
    and status = 'vigente' and payment_status = 'pagado' and payment_method <> p_method) then
    raise exception 'El pedido ya fue cobrado con otro medio.';
  end if;
  update public.sales set payment_status = 'pagado', payment_method = p_method, paid_at = now(), order_revision = order_revision + 1
    where user_id = auth.uid() and coalesce(order_id,id) = p_id and status = 'vigente' and payment_status = 'pendiente';
  return query select * from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id and status = 'vigente';
end $body$;

commit;
