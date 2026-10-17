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
    {['dish', 'empanada', 'beverage'].map((type) => {
      const products = summary.products.filter((product) => product.type === type);
      return <div key={type} className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="mb-3 text-xl font-semibold">{type === 'dish' ? 'Platos vendidos' : type === 'empanada' ? 'Empanadas vendidas' : 'Bebidas vendidas'}</h3>
        {products.length ? <>
          <div className="space-y-3 sm:hidden">{products.map((product) => <article key={product.key} className="min-w-0 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <h4 className="break-words text-lg font-semibold">{product.name}{type === 'empanada' ? ` · ${product.packSize === 12 ? 'docena' : product.packSize === 6 ? 'media docena' : 'unidad'}` : ''}</h4>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div className="min-w-0"><dt className="text-sm text-stone-600">{type === 'empanada' ? 'Cantidad' : 'Vendidos'}</dt><dd className="break-words font-medium">{type === 'empanada' ? `${product.quantity} paquete(s) · ${product.units} unidades` : product.quantity}</dd></div>
              <div className="min-w-0"><dt className="text-sm text-stone-600">{type === 'empanada' ? 'Precio por paquete' : 'Precio unitario'}</dt><dd className="break-words font-medium tabular-nums">{money.format(product.unitPriceCents / 100)}</dd></div>
              <div className="col-span-2 border-t border-stone-200 pt-2"><dt className="text-sm text-stone-600">Cobrado ese día</dt><dd className="break-words text-lg font-bold tabular-nums">{product.totalCents ? money.format(product.totalCents / 100) : 'Pendiente de cobro'}</dd></div>
            </dl>
          </article>)}</div>
          <div className="hidden overflow-x-auto sm:block"><table className="w-full text-left">
            <thead><tr className="border-b border-stone-300">{['Producto', type === 'empanada' ? 'Paquetes' : 'Cantidad', type === 'empanada' ? 'Precio por paquete' : 'Precio unitario', 'Cobrado ese día'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
            <tbody>{products.map((product) => <tr key={product.key} className="border-b border-stone-200">
              <td className="p-3">{product.name}{type === 'empanada' ? ` · ${product.packSize === 12 ? 'docena' : product.packSize === 6 ? 'media docena' : 'unidad'}` : ''}</td><td className="p-3">{type === 'empanada' ? `${product.quantity} paquete(s) · ${product.units} unidades` : product.quantity}</td>
              <td className="whitespace-nowrap p-3">{money.format(product.unitPriceCents / 100)}</td><td className="whitespace-nowrap p-3">{product.totalCents ? money.format(product.totalCents / 100) : 'Pendiente de cobro'}</td>
            </tr>)}</tbody>
          </table></div>
        </> : <p className="text-stone-600">Sin ventas de {type === 'dish' ? 'platos' : type === 'empanada' ? 'empanadas' : 'bebidas'}.</p>}
      </div>;
    })}
  </section>;
}
