import { useSales } from "../../hooks/useSales";
import { summarizePaidSales } from "../../utils/sales";
import Icon from "../common/Icon";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const count = new Intl.NumberFormat("es-AR");

export default function SalesStats({ userId, date, actions }) {
  const query = useSales(userId, date);
  const stats = summarizePaidSales(query.data?.paid ?? []);
  const ready = query.isSuccess;
  return (
    <section aria-labelledby="stats-title" className="section-card">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h2 id="stats-title" className="text-2xl font-semibold">
        Ventas de hoy
      </h2>
      {actions}
      </div>
      <dl className="grid gap-4 sm:grid-cols-3" aria-busy={query.isPending}>
        <div className="rounded-3xl border border-[#446744] bg-[#557c55] p-6 text-white">
          <span className="libreta-icon-badge is-light">
            <Icon name="dish" />
          </span>
          <dt className="text-lg font-medium">Platos vendidos</dt>
          <dd className="mt-2 break-words text-3xl font-semibold tabular-nums">
            {ready ? count.format(stats.plates) : "—"}
          </dd>
        </div>
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <span className="libreta-icon-badge">
            <Icon name="cash" />
          </span>
          <dt className="text-lg text-stone-600">En efectivo</dt>
          <dd className="mt-2 break-words text-3xl font-semibold tabular-nums">
            {ready ? money.format(stats.cashCents / 100) : "—"}
          </dd>
        </div>
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <span className="libreta-icon-badge">
            <Icon name="transfer" />
          </span>
          <dt className="text-lg text-stone-600">Por transferencia</dt>
          <dd className="mt-2 break-words text-3xl font-semibold tabular-nums">
            {ready ? money.format(stats.transferCents / 100) : "—"}
          </dd>
        </div>
      </dl>
      {query.isPending && (
        <p role="status" className="mt-4 text-lg">
          Cargando estadísticas…
        </p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-red-200 bg-white p-5"
        >
          <p className="text-lg text-red-800">
            No se pudieron cargar las ventas.
          </p>
          <p className="mt-2 break-words text-stone-700">
            {query.error.code}: {query.error.message}
          </p>
          {(query.error.code === "42703" ||
            query.error.code === "PGRST204") && (
            <p className="mt-3 text-lg">
              Falta actualizar la tabla de ventas en Supabase. Ejecutá el
              archivo ventas-pendientes.sql en SQL Editor.
            </p>
          )}
          <button
            type="button"
            className="libreta-secondary mt-4"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            Volver a intentar
          </button>
        </div>
      )}
    </section>
  );
}
