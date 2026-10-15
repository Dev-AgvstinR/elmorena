import { moneyCents } from '../../utils/sales';
import Icon from '../common/Icon';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
export default function SplitPaymentFields({ totalCents, cash, transfer, onCashChange, onTransferChange, disabled }) {
  function update(value, cashChanged) {
    if (cashChanged) onCashChange(value); else onTransferChange(value);
    try {
      const remainder = Math.max(0, totalCents - moneyCents(value));
      if (cashChanged) onTransferChange((remainder / 100).toFixed(2));
      else onCashChange((remainder / 100).toFixed(2));
    } catch { /* Permite escribir un importe incompleto antes de validarlo. */ }
  }
  let difference;
  try { difference = totalCents - moneyCents(cash) - moneyCents(transfer); } catch { difference = null; }
  return <fieldset disabled={disabled} className="space-y-4 rounded-2xl bg-stone-50 p-4">
    <legend className="px-1 text-xl font-semibold">Efectivo + transferencia</legend>
    <p className="text-lg font-semibold">Total del pedido: {money.format(totalCents / 100)}</p>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-lg"><Icon name="cash" /> Efectivo ($)<input className="libreta-input" inputMode="decimal" value={cash} onChange={(event) => update(event.target.value, true)} placeholder="Ejemplo: 5000" required /></label><label className="block text-lg"><Icon name="transfer" /> Transferencia ($)<input className="libreta-input" inputMode="decimal" value={transfer} onChange={(event) => update(event.target.value, false)} placeholder="Ejemplo: 3500" required /></label></div>
    <p className="text-stone-600">Al completar uno de los importes, se calcula el resto automáticamente.</p>
    {difference !== null && <p role="status" className={difference === 0 ? 'text-green-900' : 'text-red-800'}>{difference === 0 ? 'Los importes coinciden con el total.' : difference > 0 ? `Faltan ${money.format(difference / 100)}.` : `Se supera el total por ${money.format(-difference / 100)}.`}</p>}
  </fieldset>;
}
