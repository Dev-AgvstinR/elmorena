-- Ejecutar una vez en SQL Editor. Conserva las ventas existentes como pagadas.
begin;
alter table public.sales add column if not exists table_reference text;
alter table public.sales add column if not exists payment_status text;
alter table public.sales add column if not exists paid_at timestamptz;
update public.sales set payment_status = 'pagado', paid_at = created_at
where payment_status is null;
alter table public.sales alter column payment_method drop not null;
alter table public.sales alter column payment_status set default 'pendiente';
alter table public.sales alter column payment_status set not null;
alter table public.sales drop constraint if exists sales_payment_state_check;
alter table public.sales add constraint sales_payment_state_check check (
  (payment_status = 'pendiente' and payment_method is null and paid_at is null)
  or (payment_status = 'pagado' and payment_method is not null and paid_at is not null)
);
create index if not exists sales_pending_idx on public.sales(user_id, payment_status, paid_at);

create or replace function public.create_pending_sale(
  p_id uuid, p_dish_id uuid, p_quantity integer, p_reference text
) returns public.sales language plpgsql security invoker set search_path = '' as $$
declare result public.sales; dish public.dishes; today date;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10000 then
    raise exception 'Ingresá una cantidad entre 1 y 10000.';
  end if;
  if p_reference is null or length(trim(p_reference)) = 0 or length(trim(p_reference)) > 120 then
    raise exception 'Escribí una referencia de hasta 120 caracteres.';
  end if;
  select * into result from public.sales where id = p_id and user_id = auth.uid();
  if found then return result; end if;
  today := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  select d.* into dish from public.dishes d join public.daily_menu m
    on m.dish_id = d.id and m.user_id = d.user_id
    where d.id = p_dish_id and d.user_id = auth.uid() and d.is_active
    and m.menu_date = today and m.is_available;
  if not found then raise exception 'Esta comida ya no está disponible en el menú de hoy.'; end if;
  insert into public.sales(id, user_id, dish_id, quantity, unit_price, table_reference, payment_status)
  values (p_id, auth.uid(), dish.id, p_quantity, dish.price, trim(p_reference), 'pendiente')
  on conflict (id) do nothing;
  select * into result from public.sales where id = p_id and user_id = auth.uid();
  if not found then raise exception 'No se pudo registrar el pedido.'; end if;
  return result;
end $$;

create or replace function public.pay_sale(p_id uuid, p_method text)
returns public.sales language plpgsql security invoker set search_path = '' as $$
declare result public.sales;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_method is null or p_method not in ('efectivo', 'transferencia') then
    raise exception 'Elegí efectivo o transferencia.';
  end if;
  update public.sales set payment_status = 'pagado', payment_method = p_method, paid_at = now()
    where id = p_id and user_id = auth.uid() and payment_status = 'pendiente' and status = 'vigente'
    returning * into result;
  if not found then
    select * into result from public.sales where id = p_id and user_id = auth.uid() and status = 'vigente';
    if not found then raise exception 'No se encontró el pedido.'; end if;
    if result.payment_status <> 'pagado' or result.payment_method <> p_method then
      raise exception 'El pedido ya fue cobrado con otro medio. Actualizá la lista.';
    end if;
  end if;
  return result;
end $$;
revoke all on function public.create_pending_sale(uuid, uuid, integer, text) from public, anon;
revoke all on function public.pay_sale(uuid, text) from public, anon;
grant execute on function public.create_pending_sale(uuid, uuid, integer, text) to authenticated;
grant execute on function public.pay_sale(uuid, text) to authenticated;
commit;
