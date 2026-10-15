-- Esquema mínimo previo a las migraciones del repositorio, solo para pruebas locales.
create role anon;
create role authenticated;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key,created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth,storage to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
grant select,insert,update,delete on storage.objects to authenticated;
create table public.dishes(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 name text not null,price numeric(12,2) not null,image_path text,is_active boolean default true,
 created_at timestamptz default now(),unique(user_id,id)
);
create table public.daily_menu(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 dish_id uuid not null,menu_date date not null,is_available boolean default true,
 unique(user_id,menu_date,dish_id),foreign key(user_id,dish_id) references public.dishes(user_id,id)
);
create table public.sales(
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),
 dish_id uuid not null,quantity integer not null,unit_price numeric(12,2) not null,
 total numeric(12,2) generated always as(quantity*unit_price) stored,
 payment_method text,status text default 'vigente',created_at timestamptz default now(),
 foreign key(user_id,dish_id) references public.dishes(user_id,id)
);
do $$ declare t text; begin
 foreach t in array array['dishes','daily_menu','sales'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('create policy own_rows on public.%I to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
   execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
