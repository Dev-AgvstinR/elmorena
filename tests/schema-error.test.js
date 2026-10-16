import test from 'node:test';
import assert from 'node:assert/strict';
import { explainSchemaError } from '../src/utils/schemaError.js';

test('una función faltante indica la migración correcta', () => {
  const missing = { code: 'PGRST202', message: 'Could not find the function public.save_daily_menu in the schema cache' };
  const result = explainSchemaError(missing, 'save_daily_menu');
  assert.match(result.message, /mejoras-operacion.sql/);
  assert.equal(result.code, 'PGRST202');
});

test('un fallo de conexión conserva el mensaje original', () => {
  const network = new Error('Sin conexión');
  assert.equal(explainSchemaError(network, 'save_daily_menu'), network);
});
