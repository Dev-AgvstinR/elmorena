import Icon from '../common/Icon';
import { useEffect, useRef, useState } from "react";
import { useSales } from "../../hooks/useSales";
import { useSalesMutations } from "../../hooks/mutations/useSalesMutations";
import { groupOrders, getOrderDishes, getOrderBeverages, orderItemName } from "../../utils/sales";
import { useBeverages } from '../../hooks/useStock';
import OrderComposer from "./OrderComposer";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});
export default function SalesPanel({
  userId,
  date,
  dishes,
  orderOpen,
  onCloseOrder,
}) {
  const query = useSales(userId, date);
  const beverages = useBeverages(userId);
  const { create, pay, edit, remove } = useSalesMutations(userId);
  const [editing, setEditing] = useState(null);
  const modalOpen = orderOpen || Boolean(editing);
  const busy =
    create.isPending || pay.isPending || edit.isPending || remove.isPending;
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
  async function collect(id, method) {
    if (busy) return;
    setError("");
    setNotice("");
    try {
      await pay.mutateAsync({ id, method });
      setNotice("Pedido completo cobrado. Ya está en Pagados.");
    } catch (failure) {
      setError(`No se pudo cobrar. ${failure.message}`);
    }
  }
  const pending = groupOrders(query.data?.pending ?? []);
  const paid = groupOrders(query.data?.paid ?? []);
  function renderOrder(order, isPaid) {
    return (
      <li
        key={order.id}
        className="rounded-3xl border border-stone-200 bg-white p-6"
      >
        <h3 className="break-words text-xl font-semibold">
          {order.reference || "Sin referencia"}
        </h3>
        <ul className="my-4 space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="text-lg">
              {item.quantity} × {orderItemName(item)} ·{" "}
              {money.format(Number(item.total))}
            </li>
          ))}
        </ul>
        <p className="mb-4 text-2xl font-semibold">
          Total: {money.format(order.totalCents / 100)}
        </p>
        {isPaid ? (
          <p className="text-lg text-green-900">
            Pagado ·{" "}
            {order.method === "efectivo" ? "Efectivo" : "Transferencia"}
          </p>
        ) : (
          <>
            <p className="mb-4 text-stone-600">
              Anotado el{" "}
              {new Intl.DateTimeFormat("es-AR", {
                timeZone: "America/Argentina/Buenos_Aires",
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(order.createdAt))}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="libreta-button"
                disabled={busy}
                onClick={() => collect(order.id, "efectivo")}
              ><Icon name="cash" />Cobrar en efectivo</button>
              <button
                type="button"
                className="libreta-secondary"
                disabled={busy}
                onClick={() => collect(order.id, "transferencia")}
              ><Icon name="transfer" />Cobrar por transferencia</button>
            </div>
          </>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="libreta-secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              setEditing(order);
            }}
            aria-label={`Editar pedido de ${order.reference || "sin referencia"}`}
          ><Icon name="edit" />Editar</button>
          <button
            type="button"
            className="libreta-secondary text-red-800"
            disabled={busy}
            onClick={() => eliminate(order)}
            aria-label={`Eliminar pedido de ${order.reference || "sin referencia"}`}
          ><Icon name="delete" />Eliminar</button>
        </div>
      </li>
    );
  }
  return (
    <div className="mb-7">
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
      {query.isPending && <p role="status">Cargando pedidos…</p>}
      {query.isError && (
        <div role="alert" className="mb-5">
          <p className="text-lg text-red-800">
            No se pudieron cargar los pedidos. {query.error.message}
          </p>
          <button
            type="button"
            className="libreta-secondary mt-3"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            Volver a intentar
          </button>
        </div>
      )}
      <section aria-labelledby="pending-sales-title" className="section-card">
      <h2 id="pending-sales-title" className="mb-4 text-2xl font-semibold"><Icon name="pending" />Pendientes de pago</h2>
      {query.isSuccess && !pending.length && (
        <p className="mb-6 text-lg text-stone-600">
          No hay pedidos pendientes.
        </p>
      )}
      <ul className="space-y-4">
        {pending.map((order) => renderOrder(order, false))}
      </ul>
      </section>
      <section aria-labelledby="paid-sales-title" className="section-card">
      <h2 id="paid-sales-title" className="mb-4 text-2xl font-semibold"><Icon name="check" />Pagados de hoy</h2>
      {query.isSuccess && !paid.length && (
        <p className="text-lg text-stone-600">
          Todavía no hay pagos registrados hoy.
        </p>
      )}
      <ul className="space-y-4">
        {paid.map((order) => renderOrder(order, true))}
      </ul>
      </section>
    </div>
  );
}
