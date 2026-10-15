# Un único local: El Morena

Todas las cuentas autenticadas pertenecen al mismo local. Comparten comidas,
menú, bebidas, stock, pedidos, cobros y cierres. Las cuentas siguen teniendo
su propio correo, contraseña y sesión.

## Activación

1. Con las migraciones anteriores de ventas, bebidas y pago combinado ya
   instaladas, ejecutar `local-compartido.sql` completo en Supabase → SQL Editor.
2. Recargar la aplicación en las dos computadoras.

La migración es transaccional: si falla, no queda aplicada a medias. Guarda
una copia privada de las cinco tablas en `local_migration_backup`, conserva
los productos y sus IDs y combina los cierres de una misma fecha. Productos
con igual nombre e IDs diferentes se conservan para no alterar ventas ni stock.
La cuenta más antigua queda como clave interna del local; `created_by` conserva
la cuenta original de las filas y registra la cuenta autenticada al crear nuevas.
No volver a ejecutar las migraciones antiguas después de esta, porque restauran
las reglas por usuario. Las cuentas nuevas comparten el local automáticamente.

## Comprobación con dos cuentas

1. Iniciar sesión con cuentas diferentes en dos navegadores.
2. Crear una comida y una bebida en Stock: ambas cuentas deben verlas.
3. Armar el menú y anotar un pedido desde una cuenta; cobrarlo desde la otra.
4. Comprobar que ambas ven la misma referencia, reparto de pago y stock.
5. Resolver los pedidos pendientes y terminar el día: ambas deben ver el mismo
   resumen e historial y el día cerrado.

Las pantallas activas consultan cambios cada diez segundos y al recuperar el
foco. Los bloqueos de pedidos y de cierre se aplican al local común.

## Si ya había cierres en cuentas diferentes

Se unen sus snapshots por fecha. Los cobros todavía sin archivar que correspondan
a una fecha ya cerrada se incorporan al primer cierre disponible desde su fecha
de pago. Los pendientes se conservan; si el día actual ya estaba cerrado en alguna
cuenta, queda cerrado para todas y esos pendientes se resolverán al día siguiente.

No se puede comprobar la migración contra el servidor desde este repositorio:
requiere ejecutarla en el proyecto Supabase y verificar con las dos sesiones.
