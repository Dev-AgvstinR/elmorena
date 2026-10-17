import Icon from '../common/Icon';
import { useEffect, useRef, useState } from "react";
import { useFiados, useSales } from "../../hooks/useSales";
import { useSalesMutations } from "../../hooks/mutations/useSalesMutations";
import { groupOrders, getOrderDishes, getOrderBeverages, orderItemName } from "../../utils/sales";
import { useBeverages } from '../../hooks/useStock';
import OrderComposer from "./OrderComposer";
import OrderCardMenu from './OrderCardMenu';
import SplitPaymentDialog from './SplitPaymentDialog';
import PaymentSummary from './PaymentSummary';

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});
function uniqueSales(data) {
  return [...new Map((data?.pages.flatMap((page) => page.items) ?? []).map((sale) => [sale.id, sale])).values()];
}
function businessDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}`;
}
function PageStatus({ query, hideNextPage = false }) {
  return <div className="mt-4">
    {query.isPending && <p role="status">Cargando pedidos…</p>}
    {query.isError && <div role="alert"><p className="text-red-800">No se pudieron cargar los pedidos. {query.error.message}</p><button type="button" className="libreta-secondary mt-3" onClick={() => query.refetch()}>Volver a intentar</button></div>}
    {!hideNextPage && query.hasNextPage && <button type="button" className="libreta-secondary" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Cargando…' : 'Cargar más pedidos'}</button>}
  </div>;
}
export default function SalesPanel({
  userId,
  date,
  dishes,
  empanadaPrices = [],
  orderOpen,
  onCloseOrder,
  showPendingList = true,
  showPaidList = true,
  showFiadosList = false,
}) {
  const pendingQuery = useSales(userId, date, 'pendiente', showPendingList);
  const paidQuery = useSales(userId, date, 'pagado', showPaidList);
  const fiadosQuery = useFiados(userId, showFiadosList);
  const beverages = useBeverages(userId);
  const { create, pay, edit, remove, markFiado } = useSalesMutations(userId);
  const [editing, setEditing] = useState(null);
  const [splitOrder, setSplitOrder] = useState(null);
  const [paidListState, setPaidListState] = useState({ date, count: 4 });
  if (paidListState.date !== date) setPaidListState({ date, count: 4 });
  const visiblePaidCount = paidListState.date === date ? paidListState.count : 4;
  const modalOpen = orderOpen || Boolean(editing);
  const busy =
    create.isPending || pay.isPending || edit.isPending || remove.isPending || markFiado.isPending;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!modalOpen) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [modalOpen]);
  function closeModal() {
    if (busy) return;
    setEditing(null);
    onCloseOrder();
  }
  async function eliminate(order) {
    if (busy) return;
    setError("");
    setNotice("");
    try {
      await remove.mutateAsync({ id: order.id, revision: order.revision });
      setNotice("Pedido eliminado de la lista y las estadísticas.");
    } catch (failure) {
      setError(`No se pudo eliminar. ${failure.message}`);
    }
  }
  async function addToFiados(order) {
    if (busy || order.isFiado) return;
    setError("");
    setNotice("");
    try {
      await markFiado.mutateAsync({ id: order.id, revision: order.revision });
      setNotice("Pedido agregado a Fiados. Sigue contando como vendido y se cobrará cuando recibas el pago.");
    } catch (failure) {
      setError(`No se pudo agregar a Fiados. ${failure.message}`);
    }
  }
  const pending = groupOrders(uniqueSales(pendingQuery.data));
  const fiados = groupOrders(uniqueSales(fiadosQuery.data));
  const pendingList = showFiadosList ? fiados : pending;
  const pendingListQuery = showFiadosList ? fiadosQuery : pendingQuery;
  const paid = groupOrders(uniqueSales(paidQuery.data));
  const visiblePaid = paid.slice(0, visiblePaidCount);
  async function showMorePaid() {
    if (visiblePaidCount < paid.length) {
      setPaidListState((current) => ({ date, count: current.date === date ? current.count + 5 : 9 }));
      return;
    }
    if (paidQuery.hasNextPage) {
      const result = await paidQuery.fetchNextPage();
      if (!result.isError) setPaidListState((current) => ({ date, count: current.date === date ? current.count + 5 : 9 }));
    }
  }
  function showFewerPaid() {
    setPaidListState({ date, count: 4 });
  }
  async function collect(order, method) {
    if (busy) return;
    setError("");
    setNotice("");
    try {
      await pay.mutateAsync({ id: order.id, method, revision: order.revision });
      setNotice(order.isFiado && businessDate(order.createdAt) < date
        ? "Fiado cobrado. Se registró en los pagos de hoy como Pagado pendiente."
        : "Pedido cobrado. Ya está en Pagados.");
    } catch (failure) {
      setError(`No se pudo registrar el cobro. ${failure.message}`);
    }
  }
  function renderOrder(order, isPaid) {
    return (
      <li
        key={order.id}
        className={`sales-order-card rounded-2xl border p-4 sm:p-5 ${isPaid ? 'border-stone-200 bg-white' : 'sales-order-pending'}`}
      >
        <div className="sales-card-top">
          <div className="sales-card-badges">
            {!isPaid && <span className="sales-pending-label"><Icon name="pending" /> {order.isFiado ? 'Fiado · falta cobrar' : 'Por cobrar'}</span>}
            {isPaid && order.isFiado && businessDate(order.createdAt) < date && <span className="sales-pending-label"><Icon name="check" /> Pagado pendiente</span>}
          </div>
          <OrderCardMenu
            order={order}
            isPaid={isPaid}
            disabled={busy}
            onEdit={() => { setError(""); setEditing(order); }}
            onDelete={() => eliminate(order)}
            onFiado={() => addToFiados(order)}
          />
        </div>
        <h3 className="break-words text-lg font-semibold">
          {order.reference || "Sin referencia"}
        </h3>
        {order.serviceType && <p className="mt-2 text-lg font-medium text-green-900">Empanadas · {order.serviceType === 'llevar' ? 'Para llevar' : 'Comer en el lugar'}</p>}
        <ul className="my-3 space-y-1">
          {order.items.map((item) => (
            <li key={item.id} className="break-words text-base">
              {item.quantity} × {orderItemName(item)}{item.empanada_flavor ? ` · ${item.empanada_pack_size === 12 ? 'docena' : item.empanada_pack_size === 6 ? 'media docena' : 'unidad'}` : ''} ·{" "}
              {money.format(Number(item.total))}
            </li>
          ))}
        </ul>
        <p className="mb-3 text-xl font-semibold">
          Total: {money.format(order.totalCents / 100)}
        </p>
        {isPaid ? (
          <PaymentSummary order={order} />
        ) : (
          <>
            <p className="mb-3 text-sm text-stone-600">
              Anotado el{" "}
              {new Intl.DateTimeFormat("es-AR", {
                timeZone: "America/Argentina/Buenos_Aires",
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(order.createdAt))}
            </p>
            <div className="sales-payment-actions flex flex-wrap gap-3">
              <button type="button" className="libreta-button" disabled={busy} onClick={() => collect(order, 'efectivo')}><Icon name="cash" />Cobrar en efectivo</button>
              <button type="button" className="libreta-secondary" disabled={busy} onClick={() => collect(order, 'transferencia')}><Icon name="transfer" />Cobrar por transferencia</button>
              <button type="button" className="libreta-secondary" disabled={busy} onClick={() => setSplitOrder(order)}><Icon name="cash" />Pago combinado</button>
            </div>
          </>
        )}
      </li>
    );
  }
  return (
    <div className="mb-7">
      {splitOrder && <SplitPaymentDialog order={splitOrder} mutation={pay} onClose={() => setSplitOrder(null)} onSaved={() => { setSplitOrder(null); setNotice(splitOrder.isFiado && businessDate(splitOrder.createdAt) < date ? 'Fiado cobrado. Se registró en los pagos de hoy como Pagado pendiente.' : 'Pago registrado. El pedido está en Pagados.'); }} />}
      <dialog
        ref={dialogRef}
        className="daily-menu-dialog"
        aria-labelledby="order-title"
        onCancel={(event) => {
          event.preventDefault();
          closeModal();
        }}
      >
        <h2 id="order-title" className="mb-5 text-3xl font-semibold">
          {editing ? "Editar pedido" : "Realizar pedido"}
        </h2>
        {modalOpen && (
          <OrderComposer
            key={editing?.id ?? "new"}
            dishes={getOrderDishes(dishes, editing)}
            empanadaPrices={empanadaPrices}
            beverages={getOrderBeverages(beverages.data ?? [], editing)}
            beveragesLoading={beverages.isPending}
            beveragesError={beverages.isError}
            onRetryBeverages={() => beverages.refetch()}
            create={editing ? edit : create}
            initialOrder={editing}
            onClose={closeModal}
            onSaved={() => {
              setNotice(
                editing
                  ? "Pedido actualizado."
                  : "Pedido anotado. Quedó pendiente de pago.",
              );
              setEditing(null);
              onCloseOrder();
            }}
          />
        )}
      </dialog>
      {error && (
        <p role="alert" className="mb-5 text-lg text-red-800">
          {error}
        </p>
      )}
      <p role="status" className="mb-5 text-lg text-green-900">
        {notice}
      </p>
      {(showPendingList || showFiadosList) && <section aria-labelledby="pending-sales-title" className="section-card sales-pending-section">
      <div className="mb-5">
        <h2 id="pending-sales-title" className="text-2xl font-semibold"><Icon name="pending" />{showFiadosList ? 'Fiados sin cobrar' : 'Pendientes de pago'}</h2>
        <p className="mt-2 text-stone-700">{showFiadosList ? 'Pedidos guardados para cobrar más adelante.' : 'Pedidos que todavía tenés que cobrar.'}</p>
      </div>
      {pendingListQuery.isSuccess && !pendingList.length && (
        <p className="mb-6 text-lg text-stone-600">
          {showFiadosList ? 'No hay fiados pendientes de cobro.' : 'No hay pedidos pendientes de pago.'}
        </p>
      )}
      <ul className="space-y-4">
        {pendingList.map((order) => renderOrder(order, false))}
      </ul>
      <PageStatus query={pendingListQuery} />
      </section>}
      {showPaidList && <section aria-labelledby="paid-sales-title" className="section-card">
      <h2 id="paid-sales-title" className="mb-4 text-2xl font-semibold"><Icon name="check" />Pagados de hoy</h2>
      {paidQuery.isSuccess && !paid.length && (
        <p className="text-lg text-stone-600">
          Todavía no hay pagos registrados hoy.
        </p>
      )}
      <ul className="space-y-4">
        {visiblePaid.map((order) => renderOrder(order, true))}
      </ul>
      <PageStatus query={paidQuery} hideNextPage />
      {paid.length > 4 && visiblePaidCount > 4 && !paidQuery.hasNextPage && visiblePaidCount >= paid.length && <button type="button" className="libreta-secondary mt-4" onClick={showFewerPaid}>Mostrar menos pagos</button>}
      {visiblePaidCount < paid.length || paidQuery.hasNextPage ? <button type="button" className="libreta-secondary mt-4" disabled={paidQuery.isFetching} onClick={showMorePaid}>{paidQuery.isFetchingNextPage ? 'Cargando pagos…' : 'Mostrar más pagos'}</button> : null}
      </section>}
    </div>
  );
}

