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
  ('Menú compartido',to_regprocedure('public.save_daily_menu(date,uuid[],uuid[])') is not null,'mejoras-operacion.sql')
) as estado(componente,instalado,archivo);
