import { notify } from '../../utils/notifications';
import { useState } from 'react';
import Icon from '../common/Icon';

export default function StockAdjustment({ beverage, mutation, onClose, onSaved }) {
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (mutation.isPending) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    setError('');
    try {
      await mutation.mutateAsync({ id: beverage.id, delta: form.get('operation') === 'remove' ? -amount : amount });
      onSaved('Stock actualizado.');
    } catch (failure) { notify.error(failure.message); setError(failure.message); }
  }
  return <form onSubmit={submit} className="space-y-5"><h2 className="text-3xl font-semibold"><Icon name="stock" />Actualizar stock</h2><p className="break-words text-xl">{beverage.name} · {beverage.stock_quantity} unidades</p>
    <fieldset disabled={mutation.isPending} className="space-y-5"><label className="block text-lg">Movimiento<select className="libreta-input" name="operation"><option value="add">Agregar unidades</option><option value="remove">Retirar unidades</option></select></label><label className="block text-lg">Cantidad<input className="libreta-input" name="amount" type="number" min="1" max="1000000" step="1" defaultValue="1" required /></label></fieldset>
    {error && <p role="alert" className="text-lg text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3"><button className="libreta-button" disabled={mutation.isPending}><Icon name="save" />{mutation.isPending ? 'Guardando…' : 'Actualizar stock'}</button><button type="button" className="libreta-secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</button></div>
  </form>;
}

