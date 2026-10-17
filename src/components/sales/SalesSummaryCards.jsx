import Icon from '../common/Icon';
import { formatEmpanadaCount } from '../../utils/sales';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const count = new Intl.NumberFormat('es-AR');

export default function SalesSummaryCards({ stats, expenses, ready = true, busy = false }) {
  if (expenses?.view === 'live') {
    const cards = [
      { label: 'Platos vendidos', icon: 'dish', value: count.format(stats.plates ?? 0) },
      { label: 'Bebidas vendidas', icon: 'drink', value: count.format(stats.beverages ?? 0) },
      { label: 'Empanadas vendidas', icon: 'dish', value: count.format(stats.empanadas ?? 0), detail: formatEmpanadaCount(stats.empanadas ?? 0) },
      { label: 'Gastos registrados', icon: 'cash', value: expenses.count == null ? '—' : count.format(expenses.count) },
    ];
    return <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={busy}>
      {cards.map((card) => <div key={card.label} className="min-w-0 rounded-3xl border border-stone-200 bg-white p-5">
        <span className="libreta-icon-badge"><Icon name={card.icon} /></span>
        <dt className="text-lg text-stone-600">{card.label}</dt>
        <dd className="mt-2 break-words text-3xl font-semibold tabular-nums">{ready ? card.value : '—'}</dd>
        {ready && card.detail && <dd className="mt-1 text-lg text-stone-600">{card.detail}</dd>}
      </div>)}
    </dl>;
  }
  const cards = [
    { label: 'Total recaudado', icon: 'cash', value: money.format(stats.totalCents / 100), primary: true },
    { label: 'En efectivo', icon: 'cash', value: money.format(stats.cashCents / 100) },
    { label: 'Por transferencia', icon: 'transfer', value: money.format(stats.transferCents / 100) },
    { label: 'Platos vendidos', icon: 'dish', value: count.format(stats.plates) },
    { label: 'Empanadas vendidas', icon: 'dish', value: count.format(stats.empanadas ?? 0), detail: formatEmpanadaCount(stats.empanadas ?? 0) },
    { label: 'Bebidas vendidas', icon: 'drink', value: count.format(stats.beverages) },
  ];
  if (expenses) cards.push(
    { label: 'Gastos del día', icon: 'cash', value: `−${money.format(expenses.totalCents / 100)}` },
    { label: 'Saldo después de gastos', icon: 'cash', value: money.format((stats.totalCents - expenses.totalCents) / 100), primary: true },
  );
  return <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6" aria-busy={busy}>
    {cards.map((card) => <div key={card.label} className={`min-w-0 rounded-3xl border p-5 lg:col-span-2 ${card.primary ? 'border-[#446744] bg-[#557c55] text-white sm:col-span-2' : 'border-stone-200 bg-white'}`}>
      <span className={`libreta-icon-badge ${card.primary ? 'is-light' : ''}`}><Icon name={card.icon} /></span>
      <dt className={`text-lg ${card.primary ? 'font-medium' : 'text-stone-600'}`}>{card.label}</dt>
      <dd className="mt-2 break-words text-3xl font-semibold tabular-nums">{ready ? card.value : '—'}</dd>
      {ready && card.detail && <dd className="mt-1 text-lg text-stone-600">{card.detail}</dd>}
    </div>)}
  </dl>;
}
