import { groupOrders } from '../../utils/sales';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const methods = { efectivo: 'Efectivo', transferencia: 'Transferencia', mixto: 'Pago combinado' };

export default function DailyPaymentHistory({ sales = [] }) {
  const orders = groupOrders(sales.filter((sale) => sale.status === 'vigente' && sale.payment_status === 'pagado' && sale.paid_today !== false));
  return <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6" aria-label="Historial de pagos del día">
    <h2 className="mb-3 text-2xl font-semibold">Historial de pagos</h2>
    <p className="mb-4 text-stone-600">Cada pago con la referencia registrada en el pedido.</p>
    {orders.length ? <>
      <div className="space-y-3 sm:hidden">
        {orders.map((order) => <article key={order.id} className="min-w-0 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><p className="text-sm text-stone-600">Referencia</p><h3 className="break-words text-lg font-semibold">{order.reference || 'Sin referencia'}</h3></div>
            <span className="max-w-full break-words rounded-full bg-white px-3 py-1 text-sm font-medium text-stone-700">{methods[order.method] || 'Sin medio registrado'}</span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="min-w-0"><dt className="text-sm text-stone-600">Efectivo</dt><dd className="break-words font-semibold tabular-nums">{money.format(order.cashCents / 100)}</dd></div>
            <div className="min-w-0"><dt className="text-sm text-stone-600">Transferencia</dt><dd className="break-words font-semibold tabular-nums">{money.format(order.transferCents / 100)}</dd></div>
            <div className="col-span-2 border-t border-stone-200 pt-2"><dt className="text-sm text-stone-600">Total</dt><dd className="break-words text-lg font-bold tabular-nums">{money.format(order.totalCents / 100)}</dd></div>
          </dl>
        </article>)}
      </div>
      <div className="hidden overflow-x-auto sm:block"><table className="w-full text-left">
        <thead><tr className="border-b border-stone-300">{['Referencia', 'Medio de pago', 'Efectivo', 'Transferencia', 'Total'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id} className="border-b border-stone-200">
          <td className="break-words p-3">{order.reference || 'Sin referencia'}</td>
          <td className="p-3">{methods[order.method] || 'Sin medio registrado'}</td>
          <td className="whitespace-nowrap p-3">{money.format(order.cashCents / 100)}</td>
          <td className="whitespace-nowrap p-3">{money.format(order.transferCents / 100)}</td>
          <td className="whitespace-nowrap p-3 font-semibold">{money.format(order.totalCents / 100)}</td>
        </tr>)}</tbody>
      </table></div>
    </> : <p>Sin pagos registrados.</p>}
  </section>;
}
