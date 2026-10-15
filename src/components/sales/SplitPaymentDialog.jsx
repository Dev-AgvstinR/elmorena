import { useState } from 'react';
import CenteredDialog from '../common/CenteredDialog';
import SplitPaymentFields from './SplitPaymentFields';
import Icon from '../common/Icon';
import { validateSplit } from '../../utils/sales';

export default function SplitPaymentDialog({ order, mutation, onClose, onSaved }) {
  const [cash, setCash] = useState('');
  const [transfer, setTransfer] = useState('');
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (mutation.isPending) return;
    setError('');
    try {
      const payment = validateSplit(cash, transfer, order.totalCents);
      await mutation.mutateAsync({ id: order.id, revision: order.revision, method: 'mixto', ...payment });
      onSaved();
    } catch (failure) { setError(failure.message); }
  }
  return <CenteredDialog title="Pago combinado" busy={mutation.isPending} onClose={onClose}><form onSubmit={submit} className="space-y-5">
    <h2 className="text-3xl font-semibold"><Icon name="cash" />Pago combinado</h2><p className="break-words text-xl">{order.reference || 'Sin referencia'}</p>
    <SplitPaymentFields totalCents={order.totalCents} cash={cash} transfer={transfer} onCashChange={setCash} onTransferChange={setTransfer} disabled={mutation.isPending} />
    {error && <p role="alert" className="text-lg text-red-800">{error}</p>}
    <div className="order-actions"><button className="libreta-button" disabled={mutation.isPending}><Icon name="check" />{mutation.isPending ? 'Registrando…' : 'Registrar pago'}</button><button type="button" className="libreta-secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</button></div>
  </form></CenteredDialog>;
}
