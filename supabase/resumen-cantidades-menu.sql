-- Agrega las cantidades vendidas por plato al resumen de ventas del día.
-- Ejecutar en Supabase SQL Editor después de mejoras-operacion.sql.
begin;

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
    'cashCents',coalesce(sum(cash_amount)*100,0),
    'transferCents',coalesce(sum(transfer_amount)*100,0),
    'totalCents',coalesce(sum(total)*100,0),
    'dishQuantities',coalesce((select jsonb_object_agg(items.dish_id::text,items.quantity) from (
      select dish_id,sum(quantity)::integer as quantity from day_sales where dish_id is not null group by dish_id
    ) items),'{}'::jsonb)
  ) from day_sales;
$body$;

revoke all on function public.sales_summary(date) from public,anon;
grant execute on function public.sales_summary(date) to authenticated;

commit;
