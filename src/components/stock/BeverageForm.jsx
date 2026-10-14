import { useRef, useState } from 'react';
import Icon from '../common/Icon';

export default function BeverageForm({ beverage, mutation, onClose, onSaved }) {
  const id = useRef(beverage?.id ?? crypto.randomUUID());
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (mutation.isPending) return;
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      await mutation.mutateAsync({ id: id.current, editing: Boolean(beverage), name: form.get('name'), price: form.get('price'), quantity: beverage ? beverage.stock_quantity : form.get('quantity') });
      onSaved('Bebida guardada.');
    } catch (failure) { setError(failure.message); }
  }
  return <form onSubmit={submit} className="space-y-5"><h2 className="text-3xl font-semibold"><Icon name="drink" />{beverage ? 'Editar bebida' : 'Agregar bebida'}</h2>
    <fieldset disabled={mutation.isPending} className="space-y-5">
      <label className="block text-lg">Nombre<input name="name" className="libreta-input" defaultValue={beverage?.name ?? ''} placeholder="Ejemplo: Agua mineral 500 ml" maxLength={120} required /></label>
      <label className="block text-lg">Precio ($)<input name="price" className="libreta-input" defaultValue={beverage?.price ?? ''} inputMode="decimal" placeholder="Ejemplo: 1500" required /></label>
      {!beverage && <label className="block text-lg">Unidades iniciales<input name="quantity" className="libreta-input" type="number" min="0" max="1000000" step="1" defaultValue="0" required /></label>}
    </fieldset>
    {error && <p role="alert" className="text-lg text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3"><button disabled={mutation.isPending} className="libreta-button"><Icon name="save" />{mutation.isPending ? 'Guardando…' : 'Guardar bebida'}</button><button type="button" disabled={mutation.isPending} className="libreta-secondary" onClick={onClose}>Cancelar</button></div>
  </form>;
}
