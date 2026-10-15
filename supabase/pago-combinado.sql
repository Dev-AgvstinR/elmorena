-- Ejecutar después de bebidas-en-pedidos-corregido.sql.
begin;
alter table public.sales add column if not exists cash_amount numeric(12,2) not null default 0;
alter table public.sales add column if not exists transfer_amount numeric(12,2) not null default 0;
alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check check(payment_method in ('efectivo','transferencia','mixto'));
-- Inicializa pagos anteriores sin cambiar cantidades ni precios.
alter table public.sales disable trigger guard_sales_closed;
update public.sales set cash_amount=case when payment_method='efectivo' then total else 0 end,
  transfer_amount=case when payment_method='transferencia' then total else 0 end
  where payment_status='pagado' and payment_method in ('efectivo','transferencia') and cash_amount=0 and transfer_amount=0;
alter table public.sales enable trigger guard_sales_closed;

create or replace function public.validate_sale_payment() returns trigger
language plpgsql security invoker set search_path='' as $fn$
declare current_row public.sales;
begin
  select * into current_row from public.sales where id=new.id;
  if not found or current_row.status='anulada' then return null; end if;
  if current_row.cash_amount<0 or current_row.transfer_amount<0 then raise exception 'Los importes no pueden ser negativos.'; end if;
  if current_row.payment_status='pendiente' then
    if current_row.cash_amount<>0 or current_row.transfer_amount<>0 then raise exception 'Un pendiente no puede tener un cobro finalizado.'; end if;
  else
    if current_row.cash_amount+current_row.transfer_amount<>current_row.total then raise exception 'Efectivo y transferencia deben sumar el total del pedido.'; end if;
    if (current_row.payment_method='efectivo' and current_row.transfer_amount<>0)
      or (current_row.payment_method='transferencia' and current_row.cash_amount<>0) then raise exception 'El medio de pago no coincide con los importes.'; end if;
  end if;
  return null;
end $fn$;
drop trigger if exists validate_final_payment on public.sales;
create constraint trigger validate_final_payment after insert or update on public.sales
  deferrable initially deferred for each row execute function public.validate_sale_payment();

create or replace function public.allocate_order_payment(p_id uuid,p_cash numeric,p_transfer numeric)
returns void language plpgsql security invoker set search_path='' as $fn$
declare amount numeric; remaining numeric; cash_line numeric; line record; method text;
begin
  select sum(total) into amount from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente';
  if amount is null then raise exception 'No se encontró el pedido.'; end if;
  if p_cash is null or p_transfer is null or p_cash<0 or p_transfer<0 or p_cash<>round(p_cash,2)
    or p_transfer<>round(p_transfer,2) or p_cash+p_transfer<>amount then
    raise exception 'Efectivo y transferencia deben sumar exactamente el total del pedido.';
  end if;
  method:=case when p_transfer=0 then 'efectivo' when p_cash=0 then 'transferencia' else 'mixto' end;
  remaining:=p_cash;
  for line in select id,total from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente' order by id
  loop
    cash_line:=least(remaining,line.total);
    update public.sales set cash_amount=cash_line,transfer_amount=line.total-cash_line,payment_method=method where id=line.id and user_id=auth.uid();
    remaining:=remaining-cash_line;
  end loop;
end $fn$;

create or replace function public.pay_order_split(p_id uuid,p_cash numeric,p_transfer numeric,p_revision integer)
returns setof public.sales language plpgsql security invoker set search_path='' as $fn$
declare amount numeric; actual_cash numeric; actual_transfer numeric;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente' for update;
  select sum(total),sum(cash_amount),sum(transfer_amount) into amount,actual_cash,actual_transfer
    from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente';
  if amount is null then raise exception 'El pedido ya fue eliminado.'; end if;
  if not exists(select 1 from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente' and payment_status='pendiente') then
    if actual_cash=p_cash and actual_transfer=p_transfer then
      return query select * from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente'; return;
    end if;
    raise exception 'El pedido ya fue cobrado con otros importes. Actualizá la lista.';
  end if;
  if p_revision is null or exists(select 1 from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id
    and status='vigente' and order_revision<>p_revision) then raise exception 'El pedido cambió. Actualizá la lista antes de cobrar.'; end if;
  update public.sales set payment_status='pagado',payment_method='efectivo',paid_at=now(),order_revision=order_revision+1
    where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente' and payment_status='pendiente';
  perform public.allocate_order_payment(p_id,p_cash,p_transfer);
  return query select * from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente';
end $fn$;

create or replace function public.pay_order(p_id uuid,p_method text)
returns setof public.sales language plpgsql security invoker set search_path='' as $fn$
declare amount numeric; revision integer;
begin
  if p_method is null or p_method not in ('efectivo','transferencia') then raise exception 'Elegí un medio de pago.'; end if;
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  select sum(total),max(order_revision) into amount,revision from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente';
  return query select * from public.pay_order_split(p_id,case when p_method='efectivo' then amount else 0 end,case when p_method='transferencia' then amount else 0 end,revision);
end $fn$;

create or replace function public.edit_order_payment(p_id uuid,p_items jsonb,p_reference text,p_method text,p_revision integer,p_state text,p_cash numeric,p_transfer numeric)
returns setof public.sales language plpgsql security invoker set search_path='' as $fn$
declare amount numeric;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_state='pagado' and (p_method is null or p_method not in ('efectivo','transferencia','mixto')) then raise exception 'Elegí un medio de pago.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.edit_order(p_id,p_items,p_reference,case when p_method='mixto' then 'efectivo' else p_method end,p_revision,p_state);
  if p_state='pagado' then
    select sum(total) into amount from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente';
    perform public.allocate_order_payment(p_id,case when p_method='efectivo' then amount when p_method='transferencia' then 0 else p_cash end,
      case when p_method='transferencia' then amount when p_method='efectivo' then 0 else p_transfer end);
  end if;
  return query select * from public.sales where user_id=auth.uid() and coalesce(order_id,id)=p_id and status='vigente';
end $fn$;
revoke all on function public.allocate_order_payment(uuid,numeric,numeric) from public,anon;
revoke all on function public.pay_order_split(uuid,numeric,numeric,integer) from public,anon;
revoke all on function public.edit_order_payment(uuid,jsonb,text,text,integer,text,numeric,numeric) from public,anon;
grant execute on function public.allocate_order_payment(uuid,numeric,numeric) to authenticated;
grant execute on function public.pay_order_split(uuid,numeric,numeric,integer) to authenticated;
grant execute on function public.edit_order_payment(uuid,jsonb,text,text,integer,text,numeric,numeric) to authenticated;

-- El cierre conserva intacto el reparto del pago.
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
          new.status,new.created_at,new.table_reference,new.payment_status,new.paid_at,new.order_id,new.order_revision,new.beverage_id,new.cash_amount,new.transfer_amount)
          is not distinct from
          row(old.id,old.user_id,old.dish_id,old.quantity,old.unit_price,old.payment_method,
          old.status,old.created_at,old.table_reference,old.payment_status,old.paid_at,old.order_id,old.order_revision,old.beverage_id,old.cash_amount,old.transfer_amount)
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


commit;
