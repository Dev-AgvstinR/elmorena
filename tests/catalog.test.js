import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { defaultDishes } from '../src/data/defaultDishes.js';
import { catalogDishId, normalizeDishName } from '../src/utils/catalog.js';

test('el catálogo respeta los quince platos y sus precios', () => {
  assert.equal(defaultDishes.length, 15);
  assert.equal(new Set(defaultDishes.map((dish) => dish.slug)).size, 15);
  assert.equal(defaultDishes.filter((dish) => dish.price === 3000).length, 1);
  assert.equal(defaultDishes.filter((dish) => dish.price === 7000).length, 11);
  assert.equal(defaultDishes.filter((dish) => dish.price === 8000).length, 3);
});
test('el identificador se conserva al reintentar y separa las cuentas', async () => {
  const first = await catalogDishId('user-a', 'kupe');
  assert.equal(first, await catalogDishId('user-a', 'kupe'));
  assert.notEqual(first, await catalogDishId('user-b', 'kupe'));
  assert.notEqual(first, await catalogDishId('user-a', 'polenta'));
  assert.match(first, /^[a-f\d]{8}-[a-f\d]{4}-8[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
});
test('detecta nombres existentes con distinto uso de mayúsculas, espacios y tildes', () => {
  assert.equal(normalizeDishName('  Estofado de ALBÓNDIGAS  '), normalizeDishName('estofado de albondigas'));
});
test('todas las imágenes son PNG y cumplen el límite de Storage', () => {
  for (const dish of defaultDishes) {
    const file = new URL(`../public${dish.image}`, import.meta.url);
    assert.ok(statSync(file).size <= 5 * 1024 * 1024);
    assert.equal(readFileSync(file).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});
