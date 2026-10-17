import { notify } from '../../utils/notifications';
import Icon from '../common/Icon';
import { useRef, useState } from 'react';
import { getDishImageUrl } from '../../services/dishService';
import { calculateEmpanadaPrice, empanadaPackBreakdown, validateCart, validateSplit } from '../../utils/sales';
import SplitPaymentFields from './SplitPaymentFields';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const keyOf = (item) => item.beverageId ? `beverage:${item.beverageId}` : `dish:${item.dishId}`;
export default function OrderComposer({ dishes, beverages = [], empanadaPrices = [], beveragesLoading, beveragesError, onRetryBeverages, create, initialOrder = null, onClose, onSaved }) {
  const [items, setItems] = useState(() => initialOrder?.items.map((item) => ({
    ...(item.empanada_flavor ? {} : item.beverage_id ? { beverageId: item.beverage_id } : { dishId: item.dish_id }), quantity: item.quantity,
  })).filter((item) => item.beverageId || item.dishId) ?? []);
  const [empanadaUnits, setEmpanadaUnits] = useState(() => Object.fromEntries(['carne', 'pollo'].map((flavor) => [flavor,
    (initialOrder?.items ?? []).filter((item) => item.empanada_flavor === flavor).reduce((sum, item) => sum + Number(item.quantity) * Number(item.empanada_pack_size), 0),
  ])));
  const [serviceType, setServiceType] = useState(initialOrder?.serviceType ?? '');
  const [reference, setReference] = useState(initialOrder?.reference ?? '');
  const [method, setMethod] = useState(initialOrder?.method ?? 'efectivo');
  const [cash, setCash] = useState(((initialOrder?.cashCents ?? 0) / 100).toFixed(2));
  const [transfer, setTransfer] = useState(((initialOrder?.transferCents ?? 0) / 100).toFixed(2));
  const [tab, setTab] = useState(dishes.length ? 'dishes' : beverages.length ? 'beverages' : 'empanadas');
  const [error, setError] = useState('');
  const attempt = useRef(null);
  const busy = create.isPending;
  const effectiveEmpanadaPrices = empanadaPrices.map((row) => ({ ...row }));
  for (const line of initialOrder?.items ?? []) {
    if (!line.empanada_flavor) continue;
    const row = effectiveEmpanadaPrices.find((price) => price.flavor === line.empanada_flavor);
    if (row) row[`price_${line.empanada_pack_size}`] = line.unit_price;
  }
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
  const cartItems = [...items, ...['carne', 'pollo'].flatMap((flavor) => empanadaPackBreakdown(empanadaUnits[flavor]).map((pack) => ({ empanadaFlavor: flavor, packSize: pack.packSize, quantity: pack.quantity })))];
  const empanadaTotal = ['carne', 'pollo'].reduce((sum, flavor) => sum + (calculateEmpanadaPrice(flavor, empanadaUnits[flavor], effectiveEmpanadaPrices) ?? 0), 0);
  const empanadasNeedPrices = ['carne', 'pollo'].some((flavor) => Number(empanadaUnits[flavor]) > 0 && calculateEmpanadaPrice(flavor, empanadaUnits[flavor], effectiveEmpanadaPrices) == null);
  const hasEmpanadas = Object.values(empanadaUnits).some((quantity) => Number(quantity) > 0);
  const hasItems = cartItems.length > 0;
  const total = items.reduce((sum, item) => sum + Math.round(Number(productFor(item)?.price ?? 0) * 100) * item.quantity, 0) + empanadaTotal;
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      const order = validateCart({ items: cartItems, reference, serviceType });
      if (items.some((item) => !productFor(item))) throw new Error('Un producto ya no está disponible. Quitalo para continuar.');
      if (items.some((item) => item.beverageId && item.quantity > limit(productFor(item)))) throw new Error('No hay unidades suficientes de una bebida. Ajustá la cantidad.');
      if (empanadasNeedPrices) throw new Error('Configurá los precios por unidad y docena en Stock → Empanadas.');
      const signature = JSON.stringify(order);
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
      const split = initialOrder?.state === 'pagado' && method === 'mixto' ? validateSplit(cash, transfer, total) : {};
      await create.mutateAsync(initialOrder ? { ...order, ...split, id: initialOrder.id, revision: initialOrder.revision, state: initialOrder.state, method: initialOrder.state === 'pagado' ? method : null } : { ...order, id: attempt.current.id });
      onSaved();
    } catch (failure) { notify.error(failure.message); setError(`No se pudo guardar. ${failure.message}`); }
  }
  return <form onSubmit={submit} className="space-y-6">
    <p className="text-lg text-stone-600">Agregá comidas, bebidas y empanadas al mismo pedido.</p>
    <div className="stock-switch" aria-label="Productos del pedido">{[['dishes','dish','Comidas'],['beverages','drink','Bebidas'],['empanadas','dish','Empanadas']].map(([value, icon, label]) => <button key={value} type="button" className={tab === value ? 'is-active' : ''} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon name={icon} />{label}</button>)}</div>
    {tab === 'beverages' && beveragesLoading && <p role="status">Cargando bebidas…</p>}
    {tab === 'beverages' && beveragesError && <div role="alert"><p className="text-lg text-red-800">No se pudieron cargar las bebidas de Stock.</p><button type="button" className="libreta-secondary mt-3" onClick={onRetryBeverages}>Volver a intentar</button></div>}
    {tab !== 'empanadas' && <div className="order-products grid grid-cols-2 gap-3">{products.filter((product) => tab === 'beverages' ? product.beverageId : product.dishId).map((product) => {
      const image = getDishImageUrl(product.image_path);
      const quantity = items.find((item) => keyOf(item) === keyOf(product))?.quantity ?? 0;
      const unavailable = quantity >= limit(product);
      return <button key={keyOf(product)} type="button" disabled={busy || unavailable} onClick={() => change(product, 1)} className={`order-product overflow-hidden rounded-2xl border text-left ${quantity ? 'border-green-800 bg-green-50' : 'border-stone-300 bg-white'}`} aria-label={`Agregar ${product.name}`}>
        {image ? <img src={image} alt="" className="h-28 w-full object-cover" /> : <span className="m-4 mb-0 libreta-icon-badge"><Icon name={product.beverageId ? 'drink' : 'dish'} /></span>}
        <span className="block p-4"><span className="block break-words text-xl font-semibold">{product.name}</span><span className="mt-2 block text-lg">{money.format(Number(product.price))}</span>
          {product.beverageId && <span className="mt-1 block text-stone-600">{Math.max(0, product.stock_quantity - quantity)} disponibles</span>}
          <span className="mt-2 block font-medium text-green-900">{unavailable ? (quantity ? 'Máximo disponible' : 'Sin stock') : quantity ? `${quantity} en el pedido · Agregar otro` : '+ Agregar'}</span></span>
      </button>;
    })}</div>}
    {tab === 'empanadas' && <div className="grid gap-4 sm:grid-cols-2">{['carne', 'pollo'].map((flavor) => {
      const units = Number(empanadaUnits[flavor]) || 0;
      const totalPrice = calculateEmpanadaPrice(flavor, units, effectiveEmpanadaPrices);
      const halfDozenPrice = Number(empanadaPrices.find((row) => row.flavor === flavor)?.price_6 ?? 0);
      return <button key={flavor} type="button" disabled={busy || units >= 9994} onClick={() => setEmpanadaUnits((current) => ({ ...current, [flavor]: (Number(current[flavor]) || 0) + 6 }))} className={`order-product rounded-3xl border p-5 text-left ${units ? 'border-green-800 bg-green-50' : 'border-stone-300 bg-white'}`} aria-label={`Agregar seis empanadas de ${flavor}`}>
        <span className="libreta-icon-badge"><Icon name="dish" /></span>
        <span className="mt-2 block text-2xl font-semibold">Empanadas de {flavor}</span>
        {units > 0 && totalPrice != null ? <span className="mt-1 block text-lg text-stone-700">Subtotal: {money.format(totalPrice / 100)}</span> : halfDozenPrice > 0 ? <span className="mt-1 block text-lg text-stone-700">{money.format(halfDozenPrice)} la media docena</span> : null}
        <span className="mt-3 block font-medium text-green-900">{units ? `${units} en el pedido · tocar para agregar 6 más` : 'Tocar para agregar 6'}</span>
      </button>;
    })}</div>}
    {tab === 'dishes' && !dishes.length && <p className="text-lg">No hay comidas en el menú de hoy. Podés agregar bebidas o empanadas.</p>}
    {tab === 'beverages' && !beverages.length && !beveragesLoading && !beveragesError && <p className="text-lg">Agregá las bebidas desde Stock.</p>}
    <section aria-labelledby="cart-title" className="rounded-2xl bg-stone-50 p-4"><h3 id="cart-title" className="mb-4 text-2xl font-semibold"><Icon name="order" />Tu pedido</h3>
      {!hasItems && <p className="text-lg text-stone-600">Elegí una comida, bebida o empanada para empezar.</p>}
      <ul className="space-y-4">{items.map((item) => {
        const product = productFor(item);
        const name = product?.name ?? 'Producto no disponible';
        return <li key={keyOf(item)} className="order-cart-item border-b border-stone-200 pb-4"><p className="break-words text-xl font-medium"><Icon name={item.beverageId ? 'drink' : 'dish'} /> {name}</p><div className="order-quantity"><button type="button" disabled={busy} className="libreta-secondary" onClick={() => change(item, -1)} aria-label={`Quitar una unidad de ${name}`}>−</button><span className="min-w-8 text-center text-xl" aria-live="polite">{item.quantity}</span><button type="button" disabled={busy || !product || item.quantity >= limit(product)} className="libreta-secondary" onClick={() => change(item, 1)} aria-label={`Agregar una unidad de ${name}`}>+</button><span className="text-lg">{product ? money.format(Number(product.price) * item.quantity) : 'No disponible'}</span></div></li>;
      })}{['carne', 'pollo'].filter((flavor) => Number(empanadaUnits[flavor]) > 0).map((flavor) => {
        const units = Number(empanadaUnits[flavor]);
        const breakdown = empanadaPackBreakdown(units).map((pack) => {
          if (pack.packSize === 12) return `${pack.quantity} docena${pack.quantity === 1 ? '' : 's'}`;
          if (pack.packSize === 6) return `${pack.quantity} ${pack.quantity === 1 ? 'media docena' : 'medias docenas'}`;
          return `${pack.quantity} unidad${pack.quantity === 1 ? '' : 'es'}`;
        }).join(' + ');
        const price = calculateEmpanadaPrice(flavor, units, effectiveEmpanadaPrices);
        return <li key={`empanadas:${flavor}`} className="order-cart-item border-b border-stone-200 pb-4"><p className="text-xl font-medium">{units} empanadas de {flavor}</p><p className="mt-1 text-stone-600">{breakdown}</p><p className="mt-1 text-lg">{price == null ? 'Falta configurar el precio' : money.format(price / 100)}</p><div className="order-quantity mt-3"><button type="button" disabled={busy || units === 0} className="libreta-secondary" aria-label={`Quitar una empanada de ${flavor}`} onClick={() => setEmpanadaUnits((current) => ({ ...current, [flavor]: Math.max(0, (Number(current[flavor]) || 0) - 1) }))}>−</button><label className="min-w-0 text-base">Cantidad<input className="libreta-input text-center" type="number" min="0" max="10000" step="1" inputMode="numeric" value={empanadaUnits[flavor]} onChange={(event) => { const value = event.target.value; const parsed = Number(value); if (value === '') setEmpanadaUnits((current) => ({ ...current, [flavor]: '' })); else if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000) setEmpanadaUnits((current) => ({ ...current, [flavor]: parsed })); }} disabled={busy} /></label><button type="button" disabled={busy || units >= 10000} className="libreta-secondary" aria-label={`Agregar una empanada de ${flavor}`} onClick={() => setEmpanadaUnits((current) => ({ ...current, [flavor]: Math.min(10000, (Number(current[flavor]) || 0) + 1) }))}>+</button></div></li>;
      })}</ul><p className="mt-5 text-2xl font-semibold" aria-live="polite">Total: {money.format(total / 100)}</p>
    </section>
    {hasEmpanadas && <fieldset disabled={busy} className="space-y-3"><legend className="mb-3 text-xl font-medium">¿Dónde se van a comer las empanadas?</legend><div className="grid gap-3 sm:grid-cols-2">{[['llevar','order','Para llevar'],['local','dish','Comer en el lugar']].map(([value, icon, label]) => <label key={value} className={`libreta-secondary justify-center ${serviceType === value ? 'border-green-800 bg-green-50 text-green-950' : ''}`}><input type="radio" name="empanada-service" checked={serviceType === value} onChange={() => setServiceType(value)} /> <Icon name={icon} />{label}</label>)}</div></fieldset>}
    <label className="block text-lg">Mesa o referencia<input className="libreta-input" value={reference} onChange={(event) => setReference(event.target.value)} disabled={busy} maxLength={120} placeholder="Ejemplo: junto a la ventana" required /></label>
    {initialOrder?.state === 'pagado' && <><fieldset disabled={busy} className="space-y-3"><legend className="mb-3 text-xl font-medium">Medio de pago</legend><div className="flex flex-wrap gap-4">{[['efectivo','Efectivo'],['transferencia','Transferencia'],['mixto','Combinado']].map(([value,label]) => <label key={value} className="libreta-secondary"><input type="radio" name="payment" checked={method === value} onChange={() => setMethod(value)} />{label}</label>)}</div></fieldset>{method === 'mixto' && <SplitPaymentFields totalCents={total} cash={cash} transfer={transfer} onCashChange={setCash} onTransferChange={setTransfer} disabled={busy} />}</>}
    {error && <p role="alert" className="text-lg text-red-800">{error}</p>}
    <div className="order-actions"><button className="libreta-button" disabled={busy || !hasItems || empanadasNeedPrices || (hasEmpanadas && !serviceType)}>{busy ? 'Guardando…' : initialOrder ? 'Guardar cambios' : 'Agregar pedido'}</button><button type="button" className="libreta-secondary" disabled={busy} onClick={onClose}><Icon name="cancel" />Cancelar</button></div>
  </form>;
}

