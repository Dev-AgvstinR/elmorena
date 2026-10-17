import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDailySales } from '../src/utils/sales.js';

test('resume cantidades y precios históricos sin incluir ventas pendientes o anuladas', () => {
  const base = { status: 'vigente', payment_status: 'pagado', dish_id: 'dish', dishes: { name: 'Milanesa' }, quantity: 2, unit_price: '100.25', total: '200.50', payment_method: 'efectivo' };
  const summary = summarizeDailySales([
    base, base,
    { ...base, quantity: 1, unit_price: '110', total: '110', payment_method: 'transferencia' },
    { ...base, dish_id: null, beverage_id: 'drink', beverages: { name: 'Agua' }, quantity: 1, unit_price: '50', total: '50', payment_method: 'mixto', cash_amount: '20', transfer_amount: '30' },
    { ...base, payment_status: 'pendiente' },
    { ...base, status: 'anulada' },
  ]);
  assert.equal(summary.plates, 5);
  assert.equal(summary.beverages, 1);
  assert.equal(summary.products.length, 3);
  assert.equal(summary.products.find((product) => product.unitPriceCents === 10025).quantity, 4);
  assert.equal(summary.totalCents, 56100);
  assert.equal(summary.cashCents, 42100);
  assert.equal(summary.transferCents, 14000);
});

test('un día sin ventas tiene totales en cero', () => {
  assert.deepEqual(summarizeDailySales(), { plates: 0, empanadas: 0, beverages: 0, cashCents: 0, transferCents: 0, totalCents: 0, products: [] });
});

test('un fiado cuenta como vendido al anotarlo y no como cobrado', () => {
  const base = { status: 'vigente', payment_status: 'pendiente', sold_today: true, is_fiado: true, dish_id: 'dish', dishes: { name: 'Guiso' }, quantity: 2, unit_price: '7000', total: '14000' };
  const summary = summarizeDailySales([base]);
  assert.equal(summary.plates, 2);
  assert.equal(summary.totalCents, 0);
  assert.equal(summary.cashCents, 0);
  assert.equal(summary.products[0].totalCents, 0);
});
