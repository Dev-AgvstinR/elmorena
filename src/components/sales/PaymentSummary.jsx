const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
export default function PaymentSummary({ order }) {
  return <div className="mt-3 text-lg text-green-900">{order.method === 'mixto' ? <><p className="font-semibold">Pagado · Pago combinado</p><p>Efectivo: {money.format(order.cashCents / 100)}</p><p>Transferencia: {money.format(order.transferCents / 100)}</p></> : <p>Pagado · {order.method === 'efectivo' ? 'Efectivo' : 'Transferencia'}</p>}</div>;
}
