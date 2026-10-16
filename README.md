# El Morena

Libreta de ventas, menú, pedidos, cobros, stock e historial. Se puede instalar
como aplicación en el teléfono o la computadora después de publicarla por HTTPS.
Los pedidos y el stock requieren conexión a Supabase.

## Desarrollo local

1. Instalar Node.js 22 y ejecutar `npm ci`.
2. Copiar `.env.example` a `.env.local` y completar la URL y la clave pública
   (publishable) del proyecto Supabase. No poner una clave `service_role` o
   `sb_secret_` en variables `VITE_`.
3. Ejecutar `npm run dev`.

Para validar: `npm run lint`, `node --test tests/*.test.js` y `npm run build`.
La compilación exige que la URL de Supabase sea HTTPS y que haya una clave
pública. Genera `dist/manifest.webmanifest`, `dist/sw.js` e íconos PNG.

## Publicar en Vercel

1. En Supabase, ejecutar `supabase/verificar-esquema.sql`. Si falta «Local
   compartido», ejecutar `supabase/local-compartido.sql`. Después ejecutar
   `supabase/mejoras-operacion.sql`. Esta última función instala
   `save_daily_menu`, `sales_summary` y `sales_page`. Volver a ejecutar la
   verificación: todas las filas deben decir `listo`.
2. Conectar este repositorio en Vercel como proyecto Vite. Usar `npm ci`
   para instalar, `npm run build` para compilar y `dist` como directorio de
   salida. `vercel.json` ya configura las rutas internas y la caché de los
   archivos de actualización.
3. En Project Settings → Environment Variables, agregar `VITE_SUPABASE_URL`
   y `VITE_SUPABASE_PUBLISHABLE_KEY` para Production. Usar la URL HTTPS y la
   clave publishable del mismo proyecto Supabase.
4. Publicar y abrir la URL HTTPS. Comprobar `/`, `/stock` y `/historial`,
   incluida la recarga directa de cada ruta. Iniciar sesión, crear un pedido
   de prueba y verificar que aparece en otra cuenta.
5. En Supabase Auth → URL Configuration, establecer Site URL con la URL
   definitiva de Vercel. Agregar la URL de producción a las redirecciones si
   luego se activan invitaciones, recuperación de contraseña u otros enlaces
   por correo. La confirmación de correo sigue desactivada en Supabase según
   la configuración actual del proyecto.

Vercel sirve la aplicación por HTTPS, necesario para registrar el service
worker. En Chrome/Android se puede usar «Instalar app» o «Agregar a pantalla de
inicio». En Safari/iPhone se usa Compartir → «Agregar a pantalla de inicio».
La interfaz se puede abrir sin red gracias a la caché local, pero no se pueden
consultar ni guardar ventas sin conexión. La app muestra un aviso cuando se
pierde la conexión y ofrece aplicar las nuevas versiones cuando estén listas.

Si Vercel falla al compilar por variables ausentes, revisar que estén definidas
en el entorno Production y volver a desplegar. Si la app muestra que falta
`save_daily_menu` en la caché del esquema, ejecutar `mejoras-operacion.sql`
en Supabase; publicar el frontend por sí solo no crea funciones en la base.
