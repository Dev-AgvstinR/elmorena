import { useSalesSummary } from "../../hooks/useSales";
import SalesSummaryCards from "./SalesSummaryCards";

export default function SalesStats({ userId, date, actions }) {
  const query = useSalesSummary(userId, date);
  const stats = query.data ?? { plates: 0, beverages: 0, totalCents: 0, cashCents: 0, transferCents: 0 };
  const ready = query.isSuccess;
  return (
    <section aria-labelledby="stats-title" className="section-card">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h2 id="stats-title" className="text-2xl font-semibold">
        Ventas de hoy
      </h2>
      {actions}
      </div>
      <SalesSummaryCards stats={stats} ready={ready} busy={query.isPending} />
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

