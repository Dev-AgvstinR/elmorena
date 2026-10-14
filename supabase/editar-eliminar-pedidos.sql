-- Ejecutar después de pedidos-varios-platos.sql. Mantiene RLS y los registros anulados.
begin;
alter table public.sales add column if not exists order_revision integer not null default 0;

create or replace function public.edit_order(
  p_id uuid, p_items jsonb, p_reference text, p_method text,
  p_revision integer, p_state text
) returns setof public.sales language plpgsql security invoker set search_path = '' as $$
declare header public.sales; line public.sales; item record; price numeric; next_revision integer;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  perform 1 from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id for update;
  select * into header from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id
    and status = 'vigente' order by created_at, id limit 1;
  if not found then raise exception 'El pedido ya fue eliminado.'; end if;
  if p_revision is null or p_state is null or exists(select 1 from public.sales
    where user_id = auth.uid() and coalesce(order_id,id) = p_id and status = 'vigente'
    and (order_revision <> p_revision or payment_status <> p_state)) then
    raise exception 'El pedido cambió en otra pantalla. Cerrá y volvé a abrir la edición.';
  end if;
  if p_reference is null or length(trim(p_reference)) not between 1 and 120 then raise exception 'Escribí una referencia válida.'; end if;
  if header.payment_status = 'pagado' and (p_method is null or p_method not in ('efectivo','transferencia')) then
    raise exception 'Elegí efectivo o transferencia.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Agregá comidas al pedido.'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Elegí entre 1 y 100 comidas.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(dish_id uuid, quantity numeric)
    where dish_id is null or quantity is null or quantity < 1 or quantity > 10000 or quantity <> trunc(quantity)) then
    raise exception 'Ingresá cantidades enteras entre 1 y 10000.';
  end if;
  next_revision := header.order_revision + 1;
  -- Los platos existentes conservan el precio al que se anotaron.
  for item in select dish_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(dish_id uuid, quantity numeric) group by dish_id
  loop
    if item.quantity > 10000 then raise exception 'La cantidad máxima por comida es 10000.'; end if;
    select * into line from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id
      and status = 'vigente' and dish_id = item.dish_id order by id limit 1;
    if found then
      update public.sales set quantity = item.quantity, table_reference = trim(p_reference), order_id = p_id,
        order_revision = next_revision,
        payment_method = case when header.payment_status = 'pagado' then p_method else null end
        where id = line.id and user_id = auth.uid();
    else
      select d.price into price from public.dishes d join public.daily_menu m on m.dish_id = d.id and m.user_id = d.user_id
        where d.id = item.dish_id and d.user_id = auth.uid() and d.is_active and m.is_available
        and m.menu_date = (now() at time zone 'America/Argentina/Buenos_Aires')::date;
      if not found then raise exception 'La comida nueva ya no está en el menú de hoy.'; end if;
      insert into public.sales(user_id,order_id,dish_id,quantity,unit_price,table_reference,payment_status,payment_method,paid_at,created_at,order_revision)
        values(auth.uid(),p_id,item.dish_id,item.quantity,price,trim(p_reference),header.payment_status,
          case when header.payment_status = 'pagado' then p_method else null end,header.paid_at,header.created_at,next_revision);
    end if;
  end loop;
  update public.sales set status = 'anulada', order_revision = next_revision where user_id = auth.uid()
    and coalesce(order_id,id) = p_id and status = 'vigente'
    and dish_id not in (select dish_id from jsonb_to_recordset(p_items) as x(dish_id uuid));
  return query select * from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id and status = 'vigente';
end $$;

create or replace function public.delete_order(p_id uuid, p_revision integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.sales where user_id = auth.uid() and coalesce(order_id,id) = p_id for update;
  if p_revision is null or exists(select 1 from public.sales where user_id = auth.uid()
    and coalesce(order_id,id) = p_id and status = 'vigente' and order_revision <> p_revision) then
    raise exception 'El pedido cambió. Actualizá la lista antes de eliminarlo.';
  end if;
  update public.sales set status = 'anulada', order_revision = order_revision + 1
    where user_id = auth.uid() and coalesce(order_id,id) = p_id and status = 'vigente';
end $$;

-- Ignora las líneas retiradas al editar y protege contra edición concurrente al cobro.
create or replace function public.pay_order(p_id uuid, p_method text)
returns setof public.sales language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
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
end $$;
revoke all on function public.edit_order(uuid,jsonb,text,text,integer,text) from public,anon;
revoke all on function public.delete_order(uuid,integer) from public,anon;
grant execute on function public.edit_order(uuid,jsonb,text,text,integer,text) to authenticated;
grant execute on function public.delete_order(uuid,integer) to authenticated;
commit;
