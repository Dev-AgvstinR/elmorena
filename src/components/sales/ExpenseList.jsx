import { useState } from 'react';
import { useExpenseMutations } from '../../hooks/useExpenses';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export default function ExpenseList({ expenses, userId, date, readOnly = false }) {
  const { remove } = useExpenseMutations(userId, date);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState('');

  async function eliminate(id) {
    setError('');
    try {
      await remove.mutateAsync(id);
      setConfirmId(null);
    } catch (failure) {
      setError(failure.message);
    }
  }

  return <section aria-label="Gastos del día" className="mt-7">
    <h3 className="mb-3 text-xl font-semibold">Gastos del día</h3>
    {!expenses.length && <p className="text-stone-600">Todavía no hay gastos registrados.</p>}
    {error && <p role="alert" className="mb-3 text-red-800">{error}</p>}
    {expenses.length > 0 && <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {expenses.map((expense) => <li key={expense.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="break-words font-semibold">{expense.description}</p>
          <p className="text-sm text-stone-600">{expense.payment_method === 'efectivo' ? 'Efectivo' : 'Transferencia'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <strong className="tabular-nums">−{money.format(Number(expense.amount))}</strong>
          {!readOnly && (confirmId === expense.id ? <>
            <span>¿Eliminar?</span>
            <button type="button" className="libreta-secondary" disabled={remove.isPending} onClick={() => eliminate(expense.id)}>Sí</button>
            <button type="button" className="libreta-secondary" disabled={remove.isPending} onClick={() => setConfirmId(null)}>No</button>
          </> : <button type="button" className="text-sm font-semibold text-red-800 underline" onClick={() => setConfirmId(expense.id)}>Eliminar</button>)}
        </div>
      </li>)}
    </ul>}
  </section>;
}
