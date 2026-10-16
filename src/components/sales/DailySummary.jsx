import { summarizeDailySales } from '../../utils/sales';
import SalesSummaryCards from './SalesSummaryCards';
import { summarizeExpenses } from '../../utils/expenses';
import ExpenseList from './ExpenseList';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export default function DailySummary({ sales, expenses = [] }) {
  const summary = summarizeDailySales(sales);
  const expenseTotals = summarizeExpenses(expenses);
  return <section className="mt-6" aria-label="Resumen del día">
    <h2 className="mb-5 text-2xl font-semibold">Resumen del día</h2>
    <SalesSummaryCards stats={summary} expenses={expenseTotals} />
    <ExpenseList expenses={expenses} readOnly />
    <h2 className="mb-4 mt-8 text-2xl font-semibold">Detalle de productos vendidos</h2>
    {['dish', 'beverage'].map((type) => {
      const products = summary.products.filter((product) => product.type === type);
      return <div key={type} className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="mb-3 text-xl font-semibold">{type === 'dish' ? 'Platos vendidos' : 'Bebidas vendidas'}</h3>
        {products.length ? <div className="overflow-x-auto"><table className="w-full text-left">
          <thead><tr className="border-b border-stone-300">{['Producto', 'Cantidad', 'Precio unitario', 'Total'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{products.map((product) => <tr key={product.key} className="border-b border-stone-200">
            <td className="p-3">{product.name}</td><td className="p-3">{product.quantity}</td>
            <td className="whitespace-nowrap p-3">{money.format(product.unitPriceCents / 100)}</td><td className="whitespace-nowrap p-3">{money.format(product.totalCents / 100)}</td>
          </tr>)}</tbody>
        </table></div> : <p className="text-stone-600">Sin ventas de {type === 'dish' ? 'platos' : 'bebidas'}.</p>}
      </div>;
    })}
  </section>;
}
