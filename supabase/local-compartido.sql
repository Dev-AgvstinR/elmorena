-- Ejecutar UNA VEZ en SQL Editor después de bebidas-en-pedidos.sql y pago-combinado.sql.
-- Todas las cuentas autenticadas de este proyecto pertenecen al mismo local.
-- Conserva IDs, productos, stock, ventas y snapshots. No fusiona productos por nombre.
begin;
lock table public.dishes, public.beverages, public.daily_menu, public.sales, public.day_closures in access exclusive mode;

-- Detiene la consolidación ANTES de modificar datos si ocultaría pendientes.
do $$ begin
  if exists(select 1 from public.day_closures where business_date=(now() at time zone 'America/Argentina/Buenos_Aires')::date)
    and exists(select 1 from public.sales where status='vigente' and payment_status='pendiente') then
    raise exception 'Hay un cierre de hoy y pedidos pendientes en otras cuentas. Resolvé esos pedidos antes de compartir el local, o ejecutá la migración al comenzar mañana. No se modificó ningún dato.';
  end if;
end $$;

create table if not exists public.local_settings (
  id boolean primary key default true check(id),
  owner_id uuid not null references auth.users(id) on delete restrict
);
alter table public.local_settings enable row level security;
revoke all on public.local_settings from anon, authenticated;

-- La cuenta más antigua es solamente una clave estable para las relaciones existentes.
insert into public.local_settings(id,owner_id)
select true,id from auth.users order by created_at,id limit 1
on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from public.local_settings) then
    raise exception 'Creá al menos una cuenta antes de configurar el local.';
  end if;
end $$;

create or replace function public.local_owner_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select owner_id from public.local_settings where id and auth.uid() is not null;
$$;
revoke all on function public.local_owner_id() from public,anon;
grant execute on function public.local_owner_id() to authenticated;

-- Respaldo privado y permanente del estado previo; nunca accesible desde la app.
create table if not exists public.local_migration_backup (
  table_name text primary key,
  rows_snapshot jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.local_migration_backup enable row level security;
revoke all on public.local_migration_backup from anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['dishes','beverages','daily_menu','sales','day_closures'] loop
    execute format('insert into public.local_migration_backup(table_name,rows_snapshot) select %L,coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r on conflict(table_name) do nothing',t,t);
  end loop;
end $$;

-- Conserva la cuenta original sin usarla para separar el local.
alter table public.sales add column if not exists created_by uuid;
alter table public.dishes add column if not exists created_by uuid;
alter table public.beverages add column if not exists created_by uuid;
alter table public.day_closures add column if not exists created_by uuid;

-- Suspende solo triggers de aplicación durante la consolidación. Se restauran
-- con su estado original. Los controles de integridad se validan al final.
create temporary table local_saved_triggers on commit drop as
select c.relname as table_name,t.tgname,t.tgenabled
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('dishes','beverages','daily_menu','sales','day_closures') and not t.tgisinternal;
do $$ declare r record; begin
  for r in select * from local_saved_triggers loop
    execute format('alter table public.%I disable trigger %I',r.table_name,r.tgname);
  end loop;
end $$;

create temporary table local_saved_fks on commit drop as
select c.relname as table_name,k.conname,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('dishes','beverages','daily_menu','sales','day_closures')
and k.contype='f' and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and a.attnum=any(k.conkey));
do $$ declare r record; begin
  for r in select * from local_saved_fks loop
    execute format('alter table public.%I drop constraint %I',r.table_name,r.conname);
  end loop;
end $$;

-- Si varias cuentas cerraron la misma fecha, conserva un cierre con todos sus
-- snapshots. El respaldo mantiene también las filas originales completas.
create temporary table local_merged_closures on commit drop as
select business_date,(array_agg(id order by closed_at,id))[1] as keep_id,
  max(closed_at) as closed_at,
  (select coalesce(jsonb_agg(item),'[]'::jsonb) from public.day_closures d,
    lateral jsonb_array_elements(d.menu_snapshot) item where d.business_date=c.business_date) as menus,
  (select coalesce(jsonb_agg(item),'[]'::jsonb) from public.day_closures d,
    lateral jsonb_array_elements(d.sales_snapshot) item where d.business_date=c.business_date) as sales
from public.day_closures c group by business_date;
update public.day_closures c set menu_snapshot=m.menus,sales_snapshot=m.sales,closed_at=m.closed_at
from local_merged_closures m where c.id=m.keep_id;
delete from public.day_closures c using local_merged_closures m
where c.business_date=m.business_date and c.id<>m.keep_id;

create temporary table local_merged_menu on commit drop as
select menu_date,dish_id,bool_or(is_available) as available,
  (array_agg(user_id order by user_id))[1] as keep_user
from public.daily_menu group by menu_date,dish_id;
update public.daily_menu d set is_available=m.available from local_merged_menu m
where d.menu_date=m.menu_date and d.dish_id=m.dish_id and d.user_id=m.keep_user;
delete from public.daily_menu d using local_merged_menu m
where d.menu_date=m.menu_date and d.dish_id=m.dish_id and d.user_id<>m.keep_user;

do $$ declare t text; owner uuid; begin
  select owner_id into owner from public.local_settings where id;
  foreach t in array array['dishes','beverages','sales','day_closures'] loop
    execute format('update public.%I set created_by=coalesce(created_by,user_id)',t);
    execute format('alter table public.%I alter column created_by set default auth.uid()',t);
  end loop;
  foreach t in array array['dishes','beverages','daily_menu','sales','day_closures'] loop
    execute format('update public.%I set user_id=$1 where user_id<>$1',t) using owner;
    execute format('alter table public.%I alter column user_id set default public.local_owner_id()',t);
  end loop;
end $$;

-- Incorpora cobros de otras cuentas que todavía estaban abiertos cuando una
-- cuenta cerró esa fecha. Así no quedan ocultos detrás de un cierre compartido.
create temporary table local_extra_closed_sales on commit drop as
select s.id,c.business_date from public.sales s
cross join lateral (
  select business_date from public.day_closures
  where business_date >= (s.paid_at at time zone 'America/Argentina/Buenos_Aires')::date
  order by business_date limit 1
) c
where s.closed_day is null and s.status='vigente' and s.payment_status='pagado';
update public.day_closures c set sales_snapshot=c.sales_snapshot||extra.snapshot
from (
  select x.business_date,jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'dishes',case when d.id is not null then jsonb_build_object('name',d.name) else null end,
    'beverages',case when b.id is not null then jsonb_build_object('name',b.name) else null end
  )) as snapshot
  from local_extra_closed_sales x join public.sales s on s.id=x.id
  left join public.dishes d on d.id=s.dish_id
  left join public.beverages b on b.id=s.beverage_id
  group by x.business_date
) extra where c.business_date=extra.business_date;
update public.sales s set closed_day=x.business_date from local_extra_closed_sales x where s.id=x.id;

-- Una fecha cerrada es común a todos. Los pedidos pendientes se conservan;
-- cualquier cobro no archivado será incluido en el próximo cierre.
update public.daily_menu m set is_available=false
where exists(select 1 from public.day_closures c where c.business_date=m.menu_date);

do $$ declare r record; begin
  for r in select * from local_saved_fks loop
    execute format('alter table public.%I add constraint %I %s',r.table_name,r.conname,r.definition);
  end loop;
  for r in select * from local_saved_triggers loop
    execute format('alter table public.%I %s trigger %I',r.table_name,
      case r.tgenabled when 'D' then 'disable' when 'A' then 'enable always' when 'R' then 'enable replica' else 'enable' end,r.tgname);
  end loop;
end $$;

-- Adapta las políticas existentes, preservando sus operaciones y condiciones
-- (por ejemplo, las restricciones a ventas cerradas). Nunca habilita anon.
do $$ declare r record; definition text; begin
  for r in select * from pg_policies where schemaname='public'
    and tablename in ('dishes','beverages','daily_menu','sales','day_closures') loop
    definition:=format('alter policy %I on public.%I',r.policyname,r.tablename);
    if r.qual is not null then definition:=definition||' using ('||replace(r.qual,'auth.uid()','public.local_owner_id()')||')'; end if;
    if r.with_check is not null then definition:=definition||' with check ('||replace(r.with_check,'auth.uid()','public.local_owner_id()')||')'; end if;
    execute definition;
  end loop;
end $$;

-- Mantiene las versiones instaladas de las funciones y sus comprobaciones de
-- pagos, stock, revisión y cierre. Cambia solamente la clave de ámbito.
do $$ declare r record; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'create_pending_sale','pay_sale','create_pending_order','edit_order','delete_order',
      'pay_order','allocate_order_payment','pay_order_split','edit_order_payment',
      'adjust_beverage_stock','sync_sale_beverage_stock','lock_business_day',
      'guard_closed_day','prepare_day_closure','close_day'
    ) or (n.nspname='public' and exists (
      select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace tn on tn.oid=c.relnamespace
      where t.tgfoid=p.oid and not t.tgisinternal and tn.nspname='public'
      and c.relname in ('dishes','beverages','daily_menu','sales','day_closures')
    )) loop
    execute replace(pg_get_functiondef(r.oid),'auth.uid()','public.local_owner_id()');
  end loop;
end $$;

-- Todas las cuentas pueden administrar las imágenes del catálogo común.
drop policy if exists local_images_read on storage.objects;
drop policy if exists local_images_insert on storage.objects;
drop policy if exists local_images_update on storage.objects;
drop policy if exists local_images_delete on storage.objects;
create policy local_images_read on storage.objects for select to authenticated
using(bucket_id='dish-images' and auth.uid() is not null);
create policy local_images_insert on storage.objects for insert to authenticated
with check(bucket_id='dish-images' and (storage.foldername(name))[1]=public.local_owner_id()::text);
create policy local_images_update on storage.objects for update to authenticated
using(bucket_id='dish-images' and auth.uid() is not null)
with check(bucket_id='dish-images' and auth.uid() is not null);
create policy local_images_delete on storage.objects for delete to authenticated
using(bucket_id='dish-images' and auth.uid() is not null);

notify pgrst, 'reload schema';
commit;
