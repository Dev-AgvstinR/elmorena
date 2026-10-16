import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeExpenses } from '../src/utils/expenses.js';

test('separa los gastos por medio y calcula el saldo en centavos', () => {
  const totals = summarizeExpenses([
    { amount: '125.50', payment_method: 'efectivo' },
    { amount: '40.10', payment_method: 'transferencia' },
    { amount: '0.40', payment_method: 'efectivo' },
  ]);
  assert.deepEqual(totals, { totalCents: 16600, cashCents: 12590, transferCents: 4010 });
  assert.equal(20000 - totals.totalCents, 3400);
});
