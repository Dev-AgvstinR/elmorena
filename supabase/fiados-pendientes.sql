-- Ejecutar después de empanadas-pedidos.sql y gastos-diarios.sql.
-- Los pedidos normales siguen en Pendientes de pago en Inicio; esta migración
-- agrega una lista independiente para los fiados que pueden cobrarse otro día.
begin;

alter table public.sales add column if not exists is_fiado boolean not null default false;

-- Las líneas nuevas de un pedido fiado editado conservan su clasificación.
create or replace function public.inherit_fiado_order() returns trigger
language plpgsql security invoker set search_path='' as $body$
begin
  if new.order_id is not null and exists (
    select 1 from public.sales s where s.user_id=new.user_id and s.order_id=new.order_id and s.is_fiado
  ) then
    new.is_fiado:=true;
  end if;
  return new;
end
$body$;
drop trigger if exists inherit_fiado_order on public.sales;
create trigger inherit_fiado_order before insert on public.sales for each row execute function public.inherit_fiado_order();

create or replace function public.create_fiado_order(p_id uuid,p_items jsonb,p_reference text,p_service_type text)
returns setof public.sales language plpgsql security invoker set search_path='' as $body$
declare owner uuid:=public.local_owner_id();
begin
  if auth.uid() is null or owner is null or p_id is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  if exists(select 1 from public.sales where user_id=owner and order_id=p_id) then
    if exists(select 1 from public.sales where user_id=owner and order_id=p_id and not is_fiado) then
      raise exception 'El identificador ya corresponde a un pedido normal.';
    end if;
    return query select * from public.sales where user_id=owner and order_id=p_id;
    return;
  end if;
  perform public.create_pending_order(p_id,p_items,p_reference,p_service_type);
  update public.sales set is_fiado=true where user_id=owner and order_id=p_id;
  return query select * from public.sales where user_id=owner and order_id=p_id;
end
$body$;

create or replace function public.mark_order_as_fiado(p_id uuid,p_revision integer)
returns void language plpgsql security invoker set search_path='' as $body$
declare owner uuid:=public.local_owner_id();
begin
  if auth.uid() is null or owner is null or p_id is null then raise exception 'Iniciá sesión para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||(now() at time zone 'America/Argentina/Buenos_Aires')::date::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,0));
  perform 1 from public.sales where user_id=owner and coalesce(order_id,id)=p_id for update;
  if not found then raise exception 'El pedido ya no está disponible.'; end if;
  if not exists(select 1 from public.sales where user_id=owner and coalesce(order_id,id)=p_id and status='vigente') then
    raise exception 'El pedido ya fue eliminado.';
  end if;
  if exists(select 1 from public.sales where user_id=owner and coalesce(order_id,id)=p_id and status='vigente' and is_fiado) then return; end if;
  if p_revision is null or exists(select 1 from public.sales where user_id=owner and coalesce(order_id,id)=p_id and status='vigente'
      and (payment_status<>'pendiente' or order_revision<>p_revision)) then
    raise exception 'Este pedido cambió o ya se cobró. Actualizá la lista e intentá de nuevo.';
  end if;
  update public.sales set is_fiado=true where user_id=owner and coalesce(order_id,id)=p_id;
end
$body$;

create or replace function public.fiados_page(p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $body$
declare result jsonb;
begin
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Página de fiados inválida.'; end if;
  with eligible as materialized (
    select s.* from public.sales s where s.user_id=public.local_owner_id() and s.status='vigente'
      and s.payment_status='pendiente' and s.is_fiado
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
    left join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id
    left join public.beverages b on b.id=s.beverage_id and b.user_id=s.user_id
  ),'[]'::jsonb)) into result;
  return result;
end
$body$;

create or replace function public.sales_summary(p_date date) returns jsonb
language sql stable security invoker set search_path='' as $body$
  with bounds as (
    select p_date::timestamp at time zone 'America/Argentina/Buenos_Aires' as day_start,
      (p_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires' as day_end
  ), sold_day as materialized (
    select s.* from public.sales s cross join bounds b
    where s.user_id=public.local_owner_id() and s.status='vigente' and s.created_at>=b.day_start and s.created_at<b.day_end
      and (s.is_fiado or s.payment_status='pagado')
  ), paid_day as materialized (
    select s.* from public.sales s cross join bounds b
    where s.user_id=public.local_owner_id() and s.status='vigente' and s.payment_status='pagado' and s.closed_day is null
      and s.paid_at>=b.day_start and s.paid_at<b.day_end
  )
  select jsonb_build_object(
    'plates',(select coalesce(sum(quantity) filter(where dish_id is not null),0) from sold_day),
    'empanadas',(select coalesce(sum(quantity*empanada_pack_size) filter(where empanada_flavor is not null),0) from sold_day),
    'beverages',(select coalesce(sum(quantity) filter(where beverage_id is not null),0) from sold_day),
    'cashCents',(select coalesce(sum(cash_amount)*100,0) from paid_day),
    'transferCents',(select coalesce(sum(transfer_amount)*100,0) from paid_day),
    'totalCents',(select coalesce(sum(total)*100,0) from paid_day),
    'dishQuantities',coalesce((select jsonb_object_agg(items.dish_id::text,items.quantity) from (
      select dish_id,sum(quantity)::integer as quantity from sold_day where dish_id is not null group by dish_id
    ) items),'{}'::jsonb)
  );
$body$;

create or replace function public.sales_page(p_date date,p_state text,p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $body$
declare result jsonb;
begin
  if p_state is null or p_state not in ('pagado','pendiente') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Página de pedidos inválida.'; end if;
  with eligible as materialized (
    select s.* from public.sales s where s.user_id=public.local_owner_id() and s.status='vigente' and s.payment_status=p_state
      and (p_state='pagado' or not s.is_fiado)
      and (p_state='pendiente' or (s.closed_day is null and s.paid_at >= (p_date::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and s.paid_at < ((p_date+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')))
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
    left join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id
    left join public.beverages b on b.id=s.beverage_id and b.user_id=s.user_id
  ),'[]'::jsonb)) into result;
  return result;
end
$body$;

-- Incluye is_fiado al permitir el archivado normal de ventas pagadas.
create or replace function public.guard_closed_day() returns trigger
language plpgsql security invoker set search_path='' as $body$
declare today date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date; owner uuid;
begin
  if tg_op='DELETE' then owner:=old.user_id; else owner:=new.user_id; end if;
  if tg_table_name='sales' then
    if tg_op<>'INSERT' and old.closed_day is not null then raise exception 'El pedido pertenece a un día cerrado. Consultalo en Historial.'; end if;
    if tg_op<>'DELETE' and new.closed_day is not null then
      if tg_op='UPDATE' and new.closed_day=today and new.payment_status='pagado'
        and row(new.id,new.user_id,new.dish_id,new.quantity,new.unit_price,new.payment_method,new.status,new.created_at,new.table_reference,new.payment_status,new.paid_at,new.order_id,new.order_revision,new.beverage_id,new.cash_amount,new.transfer_amount,new.empanada_flavor,new.empanada_pack_size,new.service_type,new.is_fiado)
          is not distinct from row(old.id,old.user_id,old.dish_id,old.quantity,old.unit_price,old.payment_method,old.status,old.created_at,old.table_reference,old.payment_status,old.paid_at,old.order_id,old.order_revision,old.beverage_id,old.cash_amount,old.transfer_amount,old.empanada_flavor,old.empanada_pack_size,old.service_type,old.is_fiado)
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
end
$body$;

create or replace function public.prepare_day_closure() returns trigger
language plpgsql security invoker set search_path='' as $body$
declare today date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
  day_start timestamptz; day_end timestamptz; owner uuid:=public.local_owner_id();
begin
  if auth.uid() is null or owner is null or new.user_id<>owner or new.business_date<>today then raise exception 'Solo podés terminar tu día actual.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||today::text,0));
  if exists(select 1 from public.sales where user_id=owner and status='vigente' and payment_status='pendiente' and not is_fiado) then
    raise exception 'Todavía hay pedidos por cobrar. Cobralos o eliminá los incorrectos antes de terminar el día.';
  end if;
  day_start:=today::timestamp at time zone 'America/Argentina/Buenos_Aires';
  day_end:=(today+1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  new.closed_at:=now();
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('name',d.name,'price',d.price) order by d.name),'[]'::jsonb)
    into new.menu_snapshot from public.daily_menu m join public.dishes d on d.id=m.dish_id and d.user_id=m.user_id
    where m.user_id=owner and m.menu_date=today and m.is_available;
  select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'dishes',case when d.id is not null then jsonb_build_object('name',d.name) else null end,
    'beverages',case when b.id is not null then jsonb_build_object('name',b.name) else null end,
    'empanadas',case when s.empanada_flavor is not null then jsonb_build_object('name','Empanadas de '||s.empanada_flavor,'pack_size',s.empanada_pack_size) else null end,
    'sold_today',s.created_at>=day_start and s.created_at<day_end and (s.is_fiado or s.payment_status='pagado'),
    'paid_today',s.payment_status='pagado' and s.paid_at>=day_start and s.paid_at<day_end
  ) order by s.created_at,s.order_id,s.id),'[]'::jsonb) into new.sales_snapshot
    from public.sales s left join public.dishes d on d.id=s.dish_id and d.user_id=s.user_id
      left join public.beverages b on b.id=s.beverage_id and b.user_id=s.user_id
    where s.user_id=owner and s.status='vigente' and (
      (s.created_at>=day_start and s.created_at<day_end and (s.is_fiado or s.payment_status='pagado'))
      or (s.payment_status='pagado' and s.paid_at>=day_start and s.paid_at<day_end)
    );
  return new;
end
$body$;

create or replace function public.close_day(p_date date) returns public.day_closures
language plpgsql security invoker set search_path='' as $body$
declare result public.day_closures; today date:=(now() at time zone 'America/Argentina/Buenos_Aires')::date;
  owner uuid:=public.local_owner_id(); day_end timestamptz;
begin
  if auth.uid() is null or owner is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_date is null or p_date<>today then raise exception 'Solo podés terminar el día de hoy.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text||':'||today::text,0));
  select * into result from public.day_closures where user_id=owner and business_date=today;
  if found then return result; end if;
  if exists(select 1 from public.sales where user_id=owner and status='vigente' and payment_status='pendiente' and not is_fiado) then
    raise exception 'Todavía hay pedidos por cobrar. Cobralos o eliminá los incorrectos antes de terminar el día.';
  end if;
  insert into public.day_closures(user_id,business_date,menu_snapshot,sales_snapshot)
    values(owner,today,'[]'::jsonb,'[]'::jsonb) returning * into result;
  day_end:=(today+1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  update public.sales set closed_day=today where user_id=owner and status='vigente' and payment_status='pagado'
    and closed_day is null and paid_at<day_end;
  update public.daily_menu set is_available=false where user_id=owner and menu_date=today and is_available;
  return result;
end
$body$;

revoke all on function public.create_fiado_order(uuid,jsonb,text,text) from public,anon;
revoke all on function public.mark_order_as_fiado(uuid,integer) from public,anon;
revoke all on function public.fiados_page(integer,integer) from public,anon;
revoke all on function public.sales_summary(date) from public,anon;
revoke all on function public.sales_page(date,text,integer,integer) from public,anon;
revoke all on function public.prepare_day_closure() from public,anon;
revoke all on function public.close_day(date) from public,anon;
grant execute on function public.create_fiado_order(uuid,jsonb,text,text) to authenticated;
grant execute on function public.mark_order_as_fiado(uuid,integer) to authenticated;
grant execute on function public.fiados_page(integer,integer) to authenticated;
grant execute on function public.sales_summary(date) to authenticated;
grant execute on function public.sales_page(date,text,integer,integer) to authenticated;
grant execute on function public.close_day(date) to authenticated;
notify pgrst,'reload schema';
commit;
