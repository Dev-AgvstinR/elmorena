-- Consulta de solo lectura. Ejecutar en Supabase → SQL Editor.
-- Cada fila debe mostrar "listo". Si falta algo, ejecutar el archivo indicado.
select componente,
  case when instalado then 'listo' else 'falta' end as estado,
  archivo
from (values
  ('Comidas',to_regclass('public.dishes') is not null,'migraciones iniciales del proyecto'),
  ('Bebidas',to_regclass('public.beverages') is not null,'stock-bebidas.sql'),
  ('Menú',to_regclass('public.daily_menu') is not null,'migraciones iniciales del proyecto'),
  ('Ventas',to_regclass('public.sales') is not null,'ventas-pendientes.sql'),
  ('Historial',to_regclass('public.day_closures') is not null,'cierre-historial.sql'),
  ('Local compartido',to_regprocedure('public.local_owner_id()') is not null,'local-compartido.sql'),
  ('Resumen completo',to_regprocedure('public.sales_summary(date)') is not null,'mejoras-operacion.sql'),
  ('Páginas de pedidos',to_regprocedure('public.sales_page(date,text,integer,integer)') is not null,'mejoras-operacion.sql'),
  ('Menú compartido',to_regprocedure('public.save_daily_menu(date,uuid[],uuid[])') is not null,'mejoras-operacion.sql'),
  ('Gastos diarios',to_regclass('public.daily_expenses') is not null,'gastos-diarios.sql'),
  ('Registrar gasto',to_regprocedure('public.add_daily_expense(date,text,numeric,text)') is not null,'gastos-diarios.sql'),
  ('Eliminar gasto',to_regprocedure('public.delete_daily_expense(uuid)') is not null,'gastos-diarios.sql'),
  ('Precios de empanadas',to_regclass('public.empanada_prices') is not null,'empanadas-pedidos.sql'),
  ('Pedidos con empanadas',to_regprocedure('public.create_pending_order(uuid,jsonb,text,text)') is not null,'empanadas-pedidos.sql'),
  ('Editar pedidos con empanadas',to_regprocedure('public.edit_order_payment(uuid,jsonb,text,text,integer,text,numeric,numeric,text)') is not null,'empanadas-pedidos.sql')
  ,('Lista de fiados',to_regprocedure('public.fiados_page(integer,integer)') is not null,'fiados-pendientes.sql')
  ,('Guardar pedido como fiado',to_regprocedure('public.create_fiado_order(uuid,jsonb,text,text)') is not null,'fiados-pendientes.sql')
  ,('Pasar un pedido a fiados',to_regprocedure('public.mark_order_as_fiado(uuid,integer)') is not null,'fiados-pendientes.sql')
  ,('Clasificación de fiados',exists(select 1 from information_schema.columns where table_schema='public' and table_name='sales' and column_name='is_fiado'),'fiados-pendientes.sql')
) as estado(componente,instalado,archivo);
