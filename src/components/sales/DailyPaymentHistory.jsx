import { groupOrders } from '../../utils/sales';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const methods = { efectivo: 'Efectivo', transferencia: 'Transferencia', mixto: 'Pago combinado' };

export default function DailyPaymentHistory({ sales = [] }) {
  const orders = groupOrders(sales.filter((sale) => sale.status === 'vigente' && sale.payment_status === 'pagado'));
  return <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6" aria-label="Historial de pagos del día">
    <h2 className="mb-3 text-2xl font-semibold">Historial de pagos</h2>
    <p className="mb-4 text-stone-600">Cada pago con la referencia registrada en el pedido.</p>
    {orders.length ? <div className="overflow-x-auto"><table className="w-full text-left">
      <thead><tr className="border-b border-stone-300">{['Referencia', 'Medio de pago', 'Efectivo', 'Transferencia', 'Total'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
      <tbody>{orders.map((order) => <tr key={order.id} className="border-b border-stone-200">
        <td className="break-words p-3">{order.reference || 'Sin referencia'}</td>
        <td className="p-3">{methods[order.method] || 'Sin medio registrado'}</td>
        <td className="whitespace-nowrap p-3">{money.format(order.cashCents / 100)}</td>
        <td className="whitespace-nowrap p-3">{money.format(order.transferCents / 100)}</td>
        <td className="whitespace-nowrap p-3 font-semibold">{money.format(order.totalCents / 100)}</td>
      </tr>)}</tbody>
    </table></div> : <p>Sin pagos registrados.</p>}
  </section>;
}
