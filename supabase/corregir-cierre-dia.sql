-- Corrige el cierre sin borrar ni modificar pedidos existentes.
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
