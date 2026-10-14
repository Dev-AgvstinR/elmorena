import Icon from '../common/Icon';
import { useRef, useState } from 'react';
import { getDishImageUrl } from '../../services/dishService';
import { validateCart } from '../../utils/sales';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const keyOf = (item) => item.beverageId ? `beverage:${item.beverageId}` : `dish:${item.dishId}`;
export default function OrderComposer({ dishes, beverages = [], beveragesLoading, beveragesError, onRetryBeverages, create, initialOrder = null, onClose, onSaved }) {
  const [items, setItems] = useState(() => initialOrder?.items.map((item) => ({
    ...(item.beverage_id ? { beverageId: item.beverage_id } : { dishId: item.dish_id }), quantity: item.quantity,
  })) ?? []);
  const [reference, setReference] = useState(initialOrder?.reference ?? '');
  const [method, setMethod] = useState(initialOrder?.method ?? 'efectivo');
  const [tab, setTab] = useState(dishes.length ? 'dishes' : 'beverages');
  const [error, setError] = useState('');
  const attempt = useRef(null);
  const busy = create.isPending;
  const products = [...dishes.map((dish) => ({ ...dish, dishId: dish.id })), ...beverages.map((beverage) => ({ ...beverage, beverageId: beverage.id }))];
  const productFor = (item) => products.find((product) => keyOf(product) === keyOf(item));
  const limit = (product) => Math.min(10000, product?.beverageId ? product.stock_quantity : 10000);
  function change(item, delta) {
    const product = productFor(item);
    setItems((current) => {
      const quantity = (current.find((line) => keyOf(line) === keyOf(item))?.quantity ?? 0) + delta;
      const rest = current.filter((line) => keyOf(line) !== keyOf(item));
      if (delta > 0 && (!product || quantity > limit(product))) return current;
      return quantity > 0 ? [...rest, { ...(item.beverageId ? { beverageId: item.beverageId } : { dishId: item.dishId }), quantity }] : rest;
    });
  }
  const total = items.reduce((sum, item) => sum + Math.round(Number(productFor(item)?.price ?? 0) * 100) * item.quantity, 0);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      const order = validateCart({ items, reference });
      if (items.some((item) => !productFor(item))) throw new Error('Un producto ya no está disponible. Quitalo para continuar.');
      if (items.some((item) => item.beverageId && item.quantity > limit(productFor(item)))) throw new Error('No hay unidades suficientes de una bebida. Ajustá la cantidad.');
      const signature = JSON.stringify(order);
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
      await create.mutateAsync(initialOrder ? { ...order, id: initialOrder.id, revision: initialOrder.revision, state: initialOrder.state, method: initialOrder.state === 'pagado' ? method : null } : { ...order, id: attempt.current.id });
      onSaved();
    } catch (failure) { setError(`No se pudo guardar. ${failure.message}`); }
  }
  return <form onSubmit={submit} className="space-y-6">
    <p className="text-lg text-stone-600">Agregá comidas y bebidas al mismo pedido.</p>
    <div className="stock-switch" aria-label="Productos del pedido">{[['dishes','dish','Comidas'],['beverages','drink','Bebidas']].map(([value, icon, label]) => <button key={value} type="button" className={tab === value ? 'is-active' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon name={icon} />{label}</button>)}</div>
    {tab === 'beverages' && beveragesLoading && <p role="status">Cargando bebidas…</p>}
    {tab === 'beverages' && beveragesError && <div role="alert"><p className="text-lg text-red-800">No se pudieron cargar las bebidas de Stock.</p><button type="button" className="libreta-secondary mt-3" onClick={onRetryBeverages}>Volver a intentar</button></div>}
    <div className="grid grid-cols-2 gap-3">{products.filter((product) => tab === 'beverages' ? product.beverageId : product.dishId).map((product) => {
      const image = getDishImageUrl(product.image_path);
      const quantity = items.find((item) => keyOf(item) === keyOf(product))?.quantity ?? 0;
      const unavailable = quantity >= limit(product);
      return <button key={keyOf(product)} type="button" disabled={busy || unavailable} onClick={() => change(product, 1)} className={`overflow-hidden rounded-2xl border text-left ${quantity ? 'border-green-800 bg-green-50' : 'border-stone-300 bg-white'}`} aria-label={`Agregar ${product.name}`}>
        {image ? <img src={image} alt="" className="h-28 w-full object-cover" /> : <span className="m-4 mb-0 libreta-icon-badge"><Icon name={product.beverageId ? 'drink' : 'dish'} /></span>}
        <span className="block p-4"><span className="block break-words text-xl font-semibold">{product.name}</span><span className="mt-2 block text-lg">{money.format(Number(product.price))}</span>
          {product.beverageId && <span className="mt-1 block text-stone-600">{Math.max(0, product.stock_quantity - quantity)} disponibles</span>}
          <span className="mt-2 block font-medium text-green-900">{unavailable ? (quantity ? 'Máximo disponible' : 'Sin stock') : quantity ? `${quantity} en el pedido · Agregar otro` : '+ Agregar'}</span></span>
      </button>;
    })}</div>
    {tab === 'dishes' && !dishes.length && <p className="text-lg">No hay comidas en el menú de hoy. Podés agregar bebidas.</p>}
    {tab === 'beverages' && !beverages.length && !beveragesLoading && !beveragesError && <p className="text-lg">Agregá las bebidas desde Stock.</p>}
    <section aria-labelledby="cart-title" className="rounded-2xl bg-stone-50 p-4"><h3 id="cart-title" className="mb-4 text-2xl font-semibold"><Icon name="order" />Tu pedido</h3>
      {!items.length && <p className="text-lg text-stone-600">Elegí una comida o bebida para empezar.</p>}
      <ul className="space-y-4">{items.map((item) => {
        const product = productFor(item);
        const name = product?.name ?? 'Producto no disponible';
        return <li key={keyOf(item)} className="border-b border-stone-200 pb-4"><p className="break-words text-xl font-medium"><Icon name={item.beverageId ? 'drink' : 'dish'} /> {name}</p><div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={busy} className="libreta-secondary" onClick={() => change(item, -1)} aria-label={`Quitar una unidad de ${name}`}>−</button><span className="min-w-8 text-center text-xl" aria-live="polite">{item.quantity}</span><button type="button" disabled={busy || !product || item.quantity >= limit(product)} className="libreta-secondary" onClick={() => change(item, 1)} aria-label={`Agregar una unidad de ${name}`}>+</button><span className="text-lg">{product ? money.format(Number(product.price) * item.quantity) : 'No disponible'}</span></div></li>;
      })}</ul><p className="mt-5 text-2xl font-semibold" aria-live="polite">Total: {money.format(total / 100)}</p>
    </section>
    <label className="block text-lg">Mesa o referencia<input className="libreta-input" value={reference} onChange={(event) => setReference(event.target.value)} disabled={busy} maxLength={120} placeholder="Ejemplo: junto a la ventana" required /></label>
    {initialOrder?.state === 'pagado' && <fieldset disabled={busy} className="space-y-3"><legend className="mb-3 text-xl font-medium">Medio de pago</legend><div className="flex flex-wrap gap-4"><label className="libreta-secondary"><input type="radio" name="payment" checked={method === 'efectivo'} onChange={() => setMethod('efectivo')} />Efectivo</label><label className="libreta-secondary"><input type="radio" name="payment" checked={method === 'transferencia'} onChange={() => setMethod('transferencia')} />Transferencia</label></div></fieldset>}
    {error && <p role="alert" className="text-lg text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3"><button className="libreta-button" disabled={busy || !items.length}>{busy ? 'Guardando…' : initialOrder ? 'Guardar cambios' : 'Agregar a pendientes'}</button><button type="button" className="libreta-secondary" disabled={busy} onClick={onClose}><Icon name="cancel" />Cancelar</button></div>
  </form>;
}
