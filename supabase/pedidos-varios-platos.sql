-- Ejecutar después de ventas-pendientes.sql. No elimina ventas anteriores.
begin;
alter table public.sales add column if not exists order_id uuid;
create index if not exists sales_order_idx on public.sales(user_id, order_id);

create or replace function public.create_pending_order(p_id uuid, p_items jsonb, p_reference text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $$
declare item record; dish public.dishes; today date;
begin
  if auth.uid() is null or p_id is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  if exists(select 1 from public.sales where order_id = p_id and user_id = auth.uid()) then
    return query select * from public.sales where order_id = p_id and user_id = auth.uid();
    return;
  end if;
  if p_reference is null or length(trim(p_reference)) not between 1 and 120 then
    raise exception 'Escribí una referencia de hasta 120 caracteres.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Agregá comidas al pedido.'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Elegí entre 1 y 100 comidas distintas.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(dish_id uuid, quantity numeric)
    where dish_id is null or quantity is null or quantity < 1 or quantity > 10000 or quantity <> trunc(quantity)) then
    raise exception 'Las cantidades deben ser enteras entre 1 y 10000.';
  end if;
  today := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  for item in select dish_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(dish_id uuid, quantity numeric) group by dish_id
  loop
    if item.quantity > 10000 then raise exception 'La cantidad máxima por comida es 10000.'; end if;
    select d.* into dish from public.dishes d join public.daily_menu m
      on m.dish_id = d.id and m.user_id = d.user_id
      where d.id = item.dish_id and d.user_id = auth.uid() and d.is_active
      and m.menu_date = today and m.is_available;
    if not found then raise exception 'Una comida ya no está disponible en el menú de hoy.'; end if;
    insert into public.sales(user_id, order_id, dish_id, quantity, unit_price, table_reference, payment_status)
      values(auth.uid(), p_id, dish.id, item.quantity, dish.price, trim(p_reference), 'pendiente');
  end loop;
  return query select * from public.sales where order_id = p_id and user_id = auth.uid();
end $$;

create or replace function public.pay_order(p_id uuid, p_method text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_method is null or p_method not in ('efectivo', 'transferencia') then raise exception 'Elegí un medio de pago.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  perform 1 from public.sales where user_id = auth.uid() and coalesce(order_id, id) = p_id for update;
  if not found then raise exception 'No se encontró el pedido.'; end if;
  if exists(select 1 from public.sales where user_id = auth.uid() and coalesce(order_id, id) = p_id
    and (status <> 'vigente' or (payment_status = 'pagado' and payment_method <> p_method))) then
    raise exception 'El pedido fue anulado o cobrado con otro medio. Actualizá la lista.';
  end if;
  update public.sales set payment_status = 'pagado', payment_method = p_method, paid_at = now()
    where user_id = auth.uid() and coalesce(order_id, id) = p_id and payment_status = 'pendiente';
  return query select * from public.sales where user_id = auth.uid() and coalesce(order_id, id) = p_id;
end $$;
revoke all on function public.create_pending_order(uuid, jsonb, text) from public, anon;
revoke all on function public.pay_order(uuid, text) from public, anon;
grant execute on function public.create_pending_order(uuid, jsonb, text) to authenticated;
grant execute on function public.pay_order(uuid, text) to authenticated;
commit;
