import Icon from '../components/common/Icon';
import { Link } from 'react-router-dom';
import { useHistory, useHistoryDay } from '../hooks/useHistory';
import { useState } from 'react';
import { groupOrders, summarizePaidSales, orderItemName } from '../utils/sales';
import PaymentSummary from '../components/sales/PaymentSummary';
import DailySummary from '../components/sales/DailySummary';
import DailyPaymentHistory from '../components/sales/DailyPaymentHistory';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
export default function History({ userId }) {
  const history = useHistory(userId);
  return <main className="page-content min-h-screen px-5 py-8 md:px-10"><div className="mx-auto max-w-5xl">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-4xl font-semibold"><Icon name="history" />Historial</h1><p className="mt-3 text-lg text-stone-600">Los menús, pedidos y gastos de cada día terminado.</p></div><Link to="/" className="libreta-secondary"><Icon name="back" />Volver al inicio</Link></header>
    {history.isPending && <p role="status">Cargando historial…</p>}
    {history.isError && <div role="alert"><p className="text-lg text-red-800">No se pudo cargar el historial. {history.error.message}</p><button className="libreta-secondary mt-4" onClick={() => history.refetch()}>Volver a intentar</button></div>}
    {history.isSuccess && !history.data.pages[0].days.length && <p className="rounded-3xl bg-white p-8 text-lg">Todavía no terminaste ningún día. Acá aparecerán al usar “Terminar día”.</p>}
    <div className="space-y-6">{history.data?.pages.flatMap((page) => page.days).map((day) => {
      return <HistoryDay key={day.id} userId={userId} entry={day} />;
    })}</div>
    {history.hasNextPage && <button type="button" className="libreta-secondary mt-6" disabled={history.isFetching} onClick={() => history.fetchNextPage()}>{history.isFetchingNextPage ? 'Cargando…' : 'Ver días anteriores'}</button>}
  </div></main>;
}


function HistoryDay({ userId, entry }) {
  const [open, setOpen] = useState(false);
  const query = useHistoryDay(userId, open ? entry.id : null);
  const day = query.data;
  const stats = day ? summarizePaidSales(day.sales_snapshot) : null;
  const orders = day ? groupOrders(day.sales_snapshot) : [];
  return <details className="rounded-3xl border border-stone-200 bg-white p-6" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-2xl font-semibold"><span className="capitalize">{new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(`${entry.business_date}T12:00:00-03:00`))}</span>{stats && <span className="mt-3 block text-lg font-normal">{stats.plates} platos · {orders.length} pedidos</span>}</summary>
    {open && query.isPending && <p role="status" className="mt-4">Cargando detalle…</p>}
    {open && query.isError && <div role="alert" className="mt-4"><p>No se pudo cargar este día. {query.error.message}</p><button type="button" className="libreta-secondary mt-3" onClick={() => query.refetch()}>Volver a intentar</button></div>}
    {open && day && <>
        <DailySummary sales={day.sales_snapshot} expenses={day.expenses_snapshot ?? []} />
        <DailyPaymentHistory sales={day.sales_snapshot} />
        <details className="mt-6 rounded-2xl border border-stone-200 p-4"><summary className="cursor-pointer text-xl font-semibold">Menú del día</summary><ul className="space-y-2">{day.menu_snapshot.map((dish) => <li key={dish.id} className="text-lg">{dish.name} · {money.format(Number(dish.price))}</li>)}</ul>{!day.menu_snapshot.length && <p>Sin menú guardado.</p>}</details>
        <details className="mt-4 rounded-2xl border border-stone-200 p-4"><summary className="mb-3 cursor-pointer text-xl font-semibold">Ver detalle de los pedidos pagados</summary><ul className="space-y-4">{orders.map((order) => <li key={order.id} className="rounded-2xl bg-stone-50 p-4"><h3 className="break-words text-xl font-medium">{order.reference || 'Sin referencia'}</h3><ul className="my-3 space-y-2">{order.items.map((item) => <li key={item.id} className="text-lg">{item.quantity} × {orderItemName(item)} · {money.format(Number(item.total))}</li>)}</ul><p className="text-lg font-medium">{money.format(order.totalCents / 100)}</p><PaymentSummary order={order} /></li>)}</ul>{!orders.length && <p>Sin pedidos pagados.</p>}</details>

    </>}
  </details>;
}
