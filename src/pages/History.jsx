import Icon from '../components/common/Icon';
import { Link } from 'react-router-dom';
import { useHistory } from '../hooks/useHistory';
import { groupOrders, summarizePaidSales, orderItemName } from '../utils/sales';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
export default function History({ userId }) {
  const history = useHistory(userId);
  return <main className="min-h-screen px-5 py-8 md:px-10"><div className="mx-auto max-w-5xl">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-4xl font-semibold"><Icon name="history" />Historial</h1><p className="mt-3 text-lg text-stone-600">Los menús y pedidos de cada día terminado.</p></div><Link to="/" className="libreta-secondary"><Icon name="back" />Volver al inicio</Link></header>
    {history.isPending && <p role="status">Cargando historial…</p>}
    {history.isError && <div role="alert"><p className="text-lg text-red-800">No se pudo cargar el historial. {history.error.message}</p><button className="libreta-secondary mt-4" onClick={() => history.refetch()}>Volver a intentar</button></div>}
    {history.isSuccess && !history.data.length && <p className="rounded-3xl bg-white p-8 text-lg">Todavía no terminaste ningún día. Acá aparecerán al usar “Terminar día”.</p>}
    <div className="space-y-6">{history.data?.map((day) => {
      const stats = summarizePaidSales(day.sales_snapshot);
      const orders = groupOrders(day.sales_snapshot);
      return <details key={day.id} className="rounded-3xl border border-stone-200 bg-white p-6"><summary className="cursor-pointer text-2xl font-semibold"><span className="capitalize">{new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(`${day.business_date}T12:00:00-03:00`))}</span><span className="mt-3 block text-lg font-normal">{stats.plates} platos · {orders.length} pedidos</span></summary>
        <div className="mt-5 flex flex-wrap gap-6 text-lg"><p>Efectivo: <strong>{money.format(stats.cashCents / 100)}</strong></p><p>Transferencia: <strong>{money.format(stats.transferCents / 100)}</strong></p></div>
        <h2 className="mb-3 mt-6 text-xl font-semibold"><Icon name="dish" />Menú del día</h2><ul className="space-y-2">{day.menu_snapshot.map((dish) => <li key={dish.id} className="text-lg">{dish.name} · {money.format(Number(dish.price))}</li>)}</ul>{!day.menu_snapshot.length && <p>Sin menú guardado.</p>}
        <h2 className="mb-3 mt-6 text-xl font-semibold"><Icon name="check" />Pedidos pagados</h2><ul className="space-y-4">{orders.map((order) => <li key={order.id} className="rounded-2xl bg-stone-50 p-4"><h3 className="break-words text-xl font-medium">{order.reference || 'Sin referencia'}</h3><ul className="my-3 space-y-2">{order.items.map((item) => <li key={item.id} className="text-lg">{item.quantity} × {orderItemName(item)} · {money.format(Number(item.total))}</li>)}</ul><p className="text-lg font-medium">{money.format(order.totalCents / 100)} · {order.method === 'efectivo' ? 'Efectivo' : 'Transferencia'}</p></li>)}</ul>{!orders.length && <p>Sin pedidos pagados.</p>}
      </details>;
    })}</div>
  </div></main>;
}
