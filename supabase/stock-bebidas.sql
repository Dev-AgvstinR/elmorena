begin;
create table if not exists public.beverages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120),
  price numeric(12,2) not null check(price >= 0),
  stock_quantity integer not null default 0 check(stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.beverages enable row level security;
drop policy if exists "Leer bebidas propias" on public.beverages;
create policy "Leer bebidas propias" on public.beverages for select to authenticated using(auth.uid()=user_id);
drop policy if exists "Crear bebidas propias" on public.beverages;
create policy "Crear bebidas propias" on public.beverages for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "Editar bebidas propias" on public.beverages;
create policy "Editar bebidas propias" on public.beverages for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update on public.beverages to authenticated;
create index if not exists beverages_user_idx on public.beverages(user_id);
create or replace function public.adjust_beverage_stock(p_id uuid,p_delta integer)
returns public.beverages language plpgsql security invoker set search_path = '' as $$
declare result public.beverages;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta::bigint) > 1000000 then raise exception 'Ingresá una cantidad entre 1 y 1000000.'; end if;
  update public.beverages set stock_quantity=stock_quantity+p_delta
    where id=p_id and user_id=auth.uid() and is_active and stock_quantity+p_delta between 0 and 1000000
    returning * into result;
  if not found then raise exception 'No hay unidades suficientes, la bebida está oculta o se supera el máximo de stock.'; end if;
  return result;
end $$;
revoke all on function public.adjust_beverage_stock(uuid,integer) from public,anon;
grant execute on function public.adjust_beverage_stock(uuid,integer) to authenticated;
commit;
