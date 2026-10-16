import { useState } from 'react';
import CenteredDialog from '../common/CenteredDialog';
import { useExpenseMutations } from '../../hooks/useExpenses';
import { moneyCents } from '../../utils/sales';

export default function ExpenseDialog({ userId, date, onClose }) {
  const { add } = useExpenseMutations(userId, date);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('efectivo');
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    if (add.isPending) return;
    setError('');
    try {
      const text = description.trim();
      if (!text || text.length > 120) throw new Error('Escribí un concepto de hasta 120 caracteres.');
      const cents = moneyCents(amount);
      if (cents <= 0) throw new Error('El importe debe ser mayor que cero.');
      await add.mutateAsync({ date, description: text, amount: (cents / 100).toFixed(2), method });
      onClose();
    } catch (failure) {
      setError(failure.message);
    }
  }

  return <CenteredDialog title="Registrar gasto" busy={add.isPending} onClose={onClose}>
    <h2 className="mb-2 text-2xl font-semibold">Registrar gasto</h2>
    <p className="mb-5 text-stone-600">Este importe se descontará del saldo del día.</p>
    <form onSubmit={save} className="space-y-5">
      <label className="block font-semibold">Concepto
        <input className="libreta-input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} placeholder="Ej.: compra de hielo" autoFocus required disabled={add.isPending} />
      </label>
      <label className="block font-semibold">Importe ($)
        <input className="libreta-input" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" required disabled={add.isPending} />
      </label>
      <fieldset disabled={add.isPending}>
        <legend className="mb-2 font-semibold">Pagado con</legend>
        <div className="flex flex-wrap gap-3">
          <label className="libreta-secondary"><input type="radio" name="expense-method" checked={method === 'efectivo'} onChange={() => setMethod('efectivo')} /> Efectivo</label>
          <label className="libreta-secondary"><input type="radio" name="expense-method" checked={method === 'transferencia'} onChange={() => setMethod('transferencia')} /> Transferencia</label>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="libreta-button" disabled={add.isPending}>{add.isPending ? 'Guardando…' : 'Guardar gasto'}</button>
        <button type="button" className="libreta-secondary" disabled={add.isPending} onClick={onClose}>Cancelar</button>
      </div>
    </form>
  </CenteredDialog>;
}
