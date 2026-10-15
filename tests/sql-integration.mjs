import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

// node tests/sql-integration.mjs <ruta a @electric-sql/pglite/dist/index.js>
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const runFile = async (file) => db.exec(await read(`../supabase/${file}`));
const a = '00000000-0000-0000-0000-000000000001';
const b = '00000000-0000-0000-0000-000000000002';
const dish = '10000000-0000-0000-0000-000000000001';
const dish2 = '10000000-0000-0000-0000-000000000002';
const drink = '20000000-0000-0000-0000-000000000001';
const asUser = async (id) => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
};
try {
  await db.exec(await read('./fixtures/base-schema.sql'));
  for (const file of ['ventas-pendientes.sql','pedidos-varios-platos.sql','editar-eliminar-pedidos.sql','cierre-historial.sql','corregir-cierre-dia.sql','stock-bebidas.sql','bebidas-en-pedidos.sql','pago-combinado.sql']) await runFile(file);
  await db.query('insert into auth.users(id) values ($1),($2)',[a,b]);
  await db.query('insert into dishes(id,user_id,name,price) values ($1,$2,\'Milanesa\',100),($3,$4,\'Sopa\',50)',[dish,a,dish2,b]);
  // El guard debe abortar antes de modificar datos.
  await db.exec("alter table day_closures disable trigger prepare_closure; alter table sales disable trigger guard_sales_closed");
  await db.query("insert into day_closures(user_id,business_date) values($1,(now() at time zone 'America/Argentina/Buenos_Aires')::date)",[a]);
  await db.query("insert into sales(user_id,dish_id,quantity,unit_price,payment_status) values($1,$2,1,50,'pendiente')",[b,dish2]);
  await assert.rejects(() => runFile('local-compartido.sql'),/Hay un cierre de hoy/);
  await db.exec('rollback');
  assert.equal((await db.query('select count(distinct user_id)::int n from dishes')).rows[0].n,2);
  await db.exec('delete from sales; delete from day_closures; alter table day_closures enable trigger prepare_closure; alter table sales enable trigger guard_sales_closed');
  await runFile('local-compartido.sql');
  await runFile('mejoras-operacion.sql');
  await runFile('mejoras-operacion.sql');
  const today=(await db.query("select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text d")).rows[0].d;
  await asUser(b);
  assert.equal((await db.query('select local_owner_id() id')).rows[0].id,a);
  assert.equal((await db.query('select count(*)::int n from dishes')).rows[0].n,2);
  await db.query('select save_daily_menu($1,$2,$3)',[today,[dish],[]]);
  await asUser(a);
  await assert.rejects(() => db.query('select save_daily_menu($1,$2,$3)',[today,[dish2],[]]),/menú cambió/);
  await db.query('select save_daily_menu($1,$2,$3)',[today,[dish,dish2],[dish]]);
  await assert.rejects(() => db.query('select save_daily_menu($1,$2,$3)',[today,['ffffffff-ffff-ffff-ffff-ffffffffffff'],[dish,dish2]]),/ya no está disponible/);
  await db.query("insert into beverages(id,user_id,name,price,stock_quantity) values($1,local_owner_id(),'Agua',25,10)",[drink]);
  const order='30000000-0000-0000-0000-000000000001';
  await db.query('select create_pending_order($1,$2,$3)',[order,JSON.stringify([{dish_id:dish,quantity:2},{beverage_id:drink,quantity:1}]),'Mesa 1']);
  await asUser(b);
  await db.query('select pay_order_split($1,100,125,0)',[order]);
  assert.equal((await db.query('select stock_quantity from beverages where id=$1',[drink])).rows[0].stock_quantity,9);
  // Más de 1000 líneas: el resumen no depende de la paginación del listado.
  await db.query("insert into sales(user_id,dish_id,quantity,unit_price,payment_status,payment_method,paid_at,cash_amount,order_id) select local_owner_id(),$1,1,100,'pagado','efectivo',now(),100,gen_random_uuid() from generate_series(1,1005)",[dish]);
  const stats=(await db.query('select sales_summary($1) result',[today])).rows[0].result;
  assert.equal(stats.plates,1007);
  assert.equal(stats.beverages,1);
  assert.equal(stats.totalCents,10072500);
  assert.equal(stats.cashCents+stats.transferCents,stats.totalCents);
  let offset=0,lines=[];
  for (;;) {
    const page=(await db.query("select sales_page($1,'pagado',$2,20) result",[today,offset])).rows[0].result;
    lines.push(...page.items);
    if (!page.hasMore) break;
    offset+=20;
  }
  assert.equal(lines.length,1007);
  assert.equal(new Set(lines.map((row)=>row.id)).size,1007);
  assert.equal(lines.filter((row)=>row.order_id===order).length,2);
  await db.query('select close_day($1)',[today]);
  await asUser(a);
  assert.equal((await db.query('select jsonb_array_length(sales_snapshot)::int n from day_closures where business_date=$1',[today])).rows[0].n,1007);
  await assert.rejects(()=>db.query('select save_daily_menu($1,$2,$3)',[today,[dish],[dish,dish2]]),/día ya terminó/);
  // Simula el estado generado por la migración antigua y comprueba recuperación.
  await db.exec('reset role; alter table sales disable trigger guard_sales_closed');
  await db.query("insert into sales(user_id,dish_id,quantity,unit_price,payment_status) values($1,$2,1,100,'pendiente')",[a,dish]);
  await db.exec('alter table sales enable trigger guard_sales_closed');
  await runFile('mejoras-operacion.sql');
  assert.equal((await db.query('select count(*)::int n from day_closures')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from closure_recovery_archive')).rows[0].n,1);
  await asUser(b);
  assert.equal((await db.query('select sales_summary($1) result',[today])).rows[0].result.totalCents,10072500);
  const pendingId=(await db.query("select id from sales where payment_status='pendiente'")).rows[0].id;
  await db.query("select pay_order($1,'efectivo')",[pendingId]);
  await db.query('select close_day($1)',[today]);
  await db.exec('reset role; set role anon');
  await assert.rejects(()=>db.query('select sales_summary($1)',[today]),/permission denied/);
  console.log('OK: migraciones, guard de pendientes, dos cuentas/RLS, conflicto de menú, pago combinado/stock, 1007 líneas paginadas, resumen y cierre compartido.');
} finally {
  await db.close();
}
