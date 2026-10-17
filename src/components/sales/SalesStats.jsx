import SalesSummaryCards from "./SalesSummaryCards";
import { useDailyExpenses } from '../../hooks/useExpenses';
import ExpenseList from './ExpenseList';

export default function SalesStats({ userId, date, actions, query }) {
  const expenseQuery = useDailyExpenses(userId, date);
  const stats = query.data ?? { plates: 0, empanadas: 0, beverages: 0, totalCents: 0, cashCents: 0, transferCents: 0 };
  const expenses = { view: 'live', count: expenseQuery.isSuccess ? expenseQuery.data.length : null };
  const ready = query.isSuccess;
  return (
    <section aria-labelledby="stats-title" className="section-card">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h2 id="stats-title" className="text-2xl font-semibold">
        Ventas de hoy
      </h2>
      {actions}
      </div>
      <SalesSummaryCards stats={stats} expenses={expenses} ready={ready} busy={query.isPending || expenseQuery.isPending} />
      {(query.isPending || expenseQuery.isPending) && (
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
      {expenseQuery.isError && <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-white p-5">
        <p className="text-lg text-red-800">No se pudieron cargar los gastos. {expenseQuery.error.message}</p>
        <button type="button" className="libreta-secondary mt-4" disabled={expenseQuery.isFetching} onClick={() => expenseQuery.refetch()}>Volver a intentar</button>
      </div>}
      {expenseQuery.isSuccess && <ExpenseList expenses={expenseQuery.data} userId={userId} date={date} />}
    </section>
  );
}

