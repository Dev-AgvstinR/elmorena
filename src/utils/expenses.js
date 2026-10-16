export function summarizeExpenses(expenses = []) {
  return expenses.reduce((totals, expense) => {
    const cents = Math.round(Number(expense.amount) * 100);
    totals.totalCents += cents;
    if (expense.payment_method === 'efectivo') totals.cashCents += cents;
    if (expense.payment_method === 'transferencia') totals.transferCents += cents;
    return totals;
  }, { totalCents: 0, cashCents: 0, transferCents: 0 });
}
