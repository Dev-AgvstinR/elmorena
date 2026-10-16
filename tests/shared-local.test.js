import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { explainSchemaError } from '../src/utils/schemaError.js';

const source = (await readFile(new URL('../src/services/localService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export async function', 'async function');

function localResolver(requireUser, rpc) {
  const getSession = async () => { const user = await requireUser(); return user ? { user } : null; };
  const context = vm.createContext({ getSession, supabase: { rpc }, explainSchemaError, Error });
  vm.runInContext(source, context);
  return context.requireLocal;
}

test('cuentas diferentes resuelven la misma clave del local devuelta por el servidor', async () => {
  let account = 'account-a';
  const resolve = localResolver(async () => ({ id: account }), async (name) => {
    assert.equal(name, 'local_owner_id');
    return { data: 'shared-local', error: null };
  });
  assert.equal((await resolve()).id, 'shared-local');
  account = 'account-b';
  assert.equal((await resolve()).id, 'shared-local');
});

test('sin sesión no consulta el local ni permite continuar', async () => {
  const resolve = localResolver(async () => { throw new Error('Iniciá sesión'); }, () => assert.fail('No debe consultar sin sesión'));
  await assert.rejects(resolve, /Iniciá sesión/);
});

test('una migración faltante muestra la instrucción y no vuelve a datos privados', async () => {
  const resolve = localResolver(async () => ({ id: 'account' }), async () => ({ data: null, error: { code: 'PGRST202' } }));
  await assert.rejects(resolve, /local-compartido.sql/);
});

test('rechaza un local sin configurar', async () => {
  const resolve = localResolver(async () => ({ id: 'account' }), async () => ({ data: null, error: null }));
  await assert.rejects(resolve, /todavía no está configurado/);
});

test('lecturas simultáneas y posteriores comparten una sola consulta al local', async () => {
  let calls = 0;
  const resolve = localResolver(async () => ({ id: 'account' }), async () => { calls++; return { data: 'local' }; });
  await Promise.all([resolve(), resolve(), resolve()]);
  await resolve();
  assert.equal(calls, 1);
});

test('un fallo temporal permite reintentar y salir elimina el caché', async () => {
  let account = { id: 'account' };
  let calls = 0;
  const resolve = localResolver(async () => account, async () => ++calls === 1 ? { error: new Error('Falla temporal de red') } : { data: 'local' });
  await assert.rejects(resolve, /Falla temporal de red/);
  assert.equal((await resolve()).id, 'local');
  account = null;
  await assert.rejects(resolve, /Iniciá sesión/);
  account = { id: 'account' };
  await resolve();
  assert.equal(calls, 3);
});
