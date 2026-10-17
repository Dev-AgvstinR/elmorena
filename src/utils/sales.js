export function validateOrder({ dishId, quantity, reference }) {
  const amount = Number(quantity);
  if (!dishId) throw new Error('Elegí una comida del menú.');
  if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw new Error('Ingresá una cantidad entre 1 y 10000.');
  const text = reference.trim();
  if (!text || text.length > 120) throw new Error('Escribí una referencia de hasta 120 caracteres.');
  return { dishId, quantity: amount, reference: text };
}

export function paymentDayRange(date) {
  const start = new Date(`${date}T00:00:00-03:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}

export function summarizePaidSales(sales) {
  return sales.reduce((summary, sale) => {
    if (sale.status !== 'vigente') return summary;
    const soldToday = sale.sold_today === true || (sale.sold_today == null && sale.payment_status === 'pagado');
    if (soldToday) {
      if (sale.empanada_flavor) summary.empanadas += Number(sale.quantity) * Number(sale.empanada_pack_size || 1);
      else if (!sale.beverage_id) summary.plates += Number(sale.quantity);
    }
    if (sale.payment_status === 'pagado' && sale.paid_today !== false) {
      const payment = salePayment(sale);
      summary.cashCents += payment.cashCents;
      summary.transferCents += payment.transferCents;
    }
    return summary;
  }, { plates: 0, empanadas: 0, cashCents: 0, transferCents: 0 });
}

export function summarizeDailySales(sales = []) {
  const sold = sales.filter((sale) => sale.status === 'vigente' && (sale.sold_today === true || (sale.sold_today == null && sale.payment_status === 'pagado')));
  const paid = sales.filter((sale) => sale.status === 'vigente' && sale.payment_status === 'pagado' && sale.paid_today !== false);
  const products = new Map();
  for (const sale of sold) {
    const type = sale.empanada_flavor ? 'empanada' : sale.beverage_id ? 'beverage' : 'dish';
    const unitPriceCents = Math.round(Number(sale.unit_price) * 100);
    const name = orderItemName(sale);
    const packSize = sale.empanada_flavor ? Number(sale.empanada_pack_size || 1) : null;
    const key = JSON.stringify([type, sale.beverage_id || sale.dish_id || sale.empanada_flavor, packSize, name, unitPriceCents]);
    if (!products.has(key)) products.set(key, { key, type, name, packSize, unitPriceCents, quantity: 0, totalCents: 0 });
    const product = products.get(key);
    product.quantity += Number(sale.quantity);
    product.units = (product.units ?? 0) + (type === 'empanada' ? Number(sale.quantity) * Number(sale.empanada_pack_size || 1) : Number(sale.quantity));
    if (sale.payment_status === 'pagado' && sale.paid_today !== false) {
      product.totalCents += Math.round(Number(sale.total) * 100);
    }
  }
  return {
    ...summarizePaidSales(sales),
    beverages: sold.reduce((total, sale) => total + (sale.beverage_id ? Number(sale.quantity) : 0), 0),
    totalCents: paid.reduce((total, sale) => total + Math.round(Number(sale.total) * 100), 0),
    products: [...products.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}

export function validateCart({ items, reference, serviceType }) {
  if (!items.length || items.length > 100) throw new Error('Agregá entre 1 y 100 productos distintos.');
  const checked = items.map((item) => {
    const productCount = Number(Boolean(item.dishId)) + Number(Boolean(item.beverageId)) + Number(Boolean(item.empanadaFlavor));
    if (productCount !== 1) throw new Error('Elegí un producto por línea.');
    const amount = Number(item.quantity);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw new Error('Ingresá una cantidad entera entre 1 y 10000.');
    if (item.empanadaFlavor) {
      if (!['carne', 'pollo'].includes(item.empanadaFlavor) || ![1, 6, 12].includes(Number(item.packSize))) throw new Error('Revisá el sabor o el tamaño del paquete de empanadas.');
      return { empanadaFlavor: item.empanadaFlavor, packSize: Number(item.packSize), quantity: amount };
    }
    const value = validateOrder({ dishId: item.dishId || item.beverageId, quantity: amount, reference });
    return { ...(item.beverageId ? { beverageId: item.beverageId } : { dishId: item.dishId }), quantity: value.quantity };
  });
  const includesEmpanadas = checked.some((item) => item.empanadaFlavor);
  if (includesEmpanadas && !['llevar', 'local'].includes(serviceType)) throw new Error('Elegí si las empanadas son para llevar o para comer en el lugar.');
  return { items: checked, reference: reference.trim(), serviceType: includesEmpanadas ? serviceType : null };
}

export function groupOrders(sales) {
  const groups = new Map();
  for (const sale of sales) {
    const id = sale.order_id || sale.id;
    if (!groups.has(id)) groups.set(id, { id, reference: sale.table_reference, createdAt: sale.created_at, method: sale.payment_method, state: sale.payment_status, isFiado: Boolean(sale.is_fiado), serviceType: sale.service_type ?? null, revision: sale.order_revision ?? 0, items: [], totalCents: 0, cashCents: 0, transferCents: 0 });
    const group = groups.get(id);
    group.items.push(sale);
    group.totalCents += Math.round(Number(sale.total) * 100);
    const payment = salePayment(sale);
    group.cashCents += payment.cashCents;
    group.transferCents += payment.transferCents;
  }
  return [...groups.values()];
}

export function getOrderDishes(dishes, order) {
  const choices = new Map(dishes.map((dish) => [dish.id, dish]));
  for (const item of order?.items ?? []) {
    if (item.beverage_id || item.empanada_flavor) continue;
    choices.set(item.dish_id, {
      ...choices.get(item.dish_id), id: item.dish_id,
      name: item.dishes?.name ?? choices.get(item.dish_id)?.name ?? 'Comida guardada',
      price: item.unit_price,
    });
  }
  return [...choices.values()];
}

export function getOrderBeverages(beverages, order) {
  const choices = new Map(beverages.map((beverage) => [beverage.id, beverage]));
  for (const item of order?.items ?? []) {
    if (!item.beverage_id) continue;
    const current = choices.get(item.beverage_id);
    choices.set(item.beverage_id, { ...current, id: item.beverage_id,
      name: item.beverages?.name ?? current?.name ?? 'Bebida guardada', price: item.unit_price,
      stock_quantity: (current?.stock_quantity ?? 0) + item.quantity });
  }
  return [...choices.values()];
}

export function orderItemName(item) {
  if (item.empanada_flavor) return `Empanadas de ${item.empanada_flavor}`;
  return item.beverages?.name ?? item.dishes?.name ?? (item.beverage_id ? 'Bebida' : 'Comida');
}

export function empanadaPackBreakdown(units) {
  const amount = Math.max(0, Math.trunc(Number(units) || 0));
  const dozens = Math.floor(amount / 12);
  const remainder = amount % 12;
  const halfDozens = Math.floor(remainder / 6);
  const singles = remainder % 6;
  return [
    ...(dozens ? [{ packSize: 12, quantity: dozens }] : []),
    ...(halfDozens ? [{ packSize: 6, quantity: halfDozens }] : []),
    ...(singles ? [{ packSize: 1, quantity: singles }] : []),
  ];
}

export function empanadaPackLabel(size) {
  return size === 12 ? 'docena' : size === 6 ? 'media docena' : 'unidad';
}

export function formatEmpanadaCount(units) {
  const amount = Math.max(0, Math.trunc(Number(units) || 0));
  if (!amount) return 'Sin empanadas';
  const dozens = Math.floor(amount / 12);
  const remainder = amount % 12;
  const half = Math.floor(remainder / 6);
  const singles = remainder % 6;
  const parts = [];
  if (dozens) parts.push(`${dozens} docena${dozens === 1 ? '' : 's'}`);
  if (half) parts.push(dozens ? 'media' : 'media docena');
  if (singles) parts.push(`${singles} unidad${singles === 1 ? '' : 'es'}`);
  return parts.join(' y ');
}

export function calculateEmpanadaPrice(flavor, units, prices = []) {
  const priceRow = prices.find((row) => row.flavor === flavor);
  if (!priceRow) return null;
  return empanadaPackBreakdown(units).reduce((cents, pack) => {
    const price = pack.packSize === 6
      ? Number(priceRow.price_6 ?? Number(priceRow.price_12) / 2)
      : Number(priceRow[`price_${pack.packSize}`]);
    if (!Number.isFinite(price) || price <= 0) return null;
    return cents == null ? null : cents + Math.round(price * 100) * pack.quantity;
  }, 0);
}

export function salePayment(sale) {
  const total = Math.round(Number(sale.total) * 100);
  return {
    cashCents: sale.cash_amount != null ? Math.round(Number(sale.cash_amount) * 100) : sale.payment_method === 'efectivo' ? total : 0,
    transferCents: sale.transfer_amount != null ? Math.round(Number(sale.transfer_amount) * 100) : sale.payment_method === 'transferencia' ? total : 0,
  };
}
export function moneyCents(value) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Ingresá un importe válido con hasta dos decimales, sin puntos de miles.');
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('El importe es demasiado grande.');
  return cents;
}
export function validateSplit(cash, transfer, totalCents) {
  const cashCents = moneyCents(cash), transferCents = moneyCents(transfer);
  if (cashCents + transferCents !== totalCents) throw new Error('Efectivo y transferencia deben sumar exactamente el total del pedido.');
  return { cashAmount: cashCents / 100, transferAmount: transferCents / 100 };
}
