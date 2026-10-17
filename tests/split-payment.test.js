import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOrders, moneyCents, summarizePaidSales, validateSplit } from '../src/utils/sales.js';

test('permite repartir el total exacto con coma decimal', () => {
  assert.deepEqual(validateSplit('5000,25', '3499,75', 850000), { cashAmount: 5000.25, transferAmount: 3499.75 });
  assert.deepEqual(validateSplit('0,10', '0,20', 30), { cashAmount: .1, transferAmount: .2 });
});
test('rechaza faltantes, excedentes e importes inválidos', () => {
  assert.throws(() => validateSplit('50', '49', 10000));
  assert.throws(() => validateSplit('50', '51', 10000));
  for (const value of ['-1', '', '1.234', '1e3', 'abc']) assert.throws(() => moneyCents(value));
});
test('suma el reparto de cada línea y cuenta solo platos', () => {
  const base = { order_id: 'order', status: 'vigente', payment_status: 'pagado', payment_method: 'mixto' };
  const rows = [
    { ...base, id: 'a', quantity: 2, total: '6000.50', cash_amount: '5000.25', transfer_amount: '1000.25' },
    { ...base, id: 'b', beverage_id: 'drink', quantity: 1, total: '2499.50', cash_amount: '0', transfer_amount: '2499.50' },
  ];
  assert.deepEqual(summarizePaidSales(rows), { plates: 2, empanadas: 0, cashCents: 500025, transferCents: 349975 });
  const order = groupOrders(rows)[0];
  assert.equal(order.cashCents + order.transferCents, order.totalCents);
});
test('los snapshots antiguos mantienen su medio de pago', () => {
  const base = { status: 'vigente', payment_status: 'pagado', quantity: 1, total: '100.25' };
  assert.deepEqual(summarizePaidSales([{ ...base, payment_method: 'efectivo' }, { ...base, payment_method: 'transferencia' }]), { plates: 2, empanadas: 0, cashCents: 10025, transferCents: 10025 });
});
test('anulados y pendientes no aportan cobros ni platos', () => {
  const sale = { quantity: 2, total: 100, cash_amount: 60, transfer_amount: 40, payment_method: 'mixto' };
  assert.deepEqual(summarizePaidSales([{ ...sale, status: 'anulada', payment_status: 'pagado' }, { ...sale, status: 'vigente', payment_status: 'pendiente' }]), { plates: 0, empanadas: 0, cashCents: 0, transferCents: 0 });
});
