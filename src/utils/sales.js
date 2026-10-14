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
    if (sale.status !== 'vigente' || sale.payment_status !== 'pagado') return summary;
    if (!sale.beverage_id) summary.plates += Number(sale.quantity);
    const cents = Math.round(Number(sale.total) * 100);
    if (sale.payment_method === 'efectivo') summary.cashCents += cents;
    if (sale.payment_method === 'transferencia') summary.transferCents += cents;
    return summary;
  }, { plates: 0, cashCents: 0, transferCents: 0 });
}

export function validateCart({ items, reference }) {
  if (!items.length || items.length > 100) throw new Error('Agregá entre 1 y 100 productos distintos.');
  const checked = items.map((item) => {
    if (Boolean(item.dishId) === Boolean(item.beverageId)) throw new Error('Elegí una comida o bebida por línea.');
    const value = validateOrder({ dishId: item.dishId || item.beverageId, quantity: item.quantity, reference });
    return { ...(item.beverageId ? { beverageId: item.beverageId } : { dishId: item.dishId }), quantity: value.quantity };
  });
  return { items: checked, reference: reference.trim() };
}

export function groupOrders(sales) {
  const groups = new Map();
  for (const sale of sales) {
    const id = sale.order_id || sale.id;
    if (!groups.has(id)) groups.set(id, { id, reference: sale.table_reference, createdAt: sale.created_at, method: sale.payment_method, state: sale.payment_status, revision: sale.order_revision ?? 0, items: [], totalCents: 0 });
    const group = groups.get(id);
    group.items.push(sale);
    group.totalCents += Math.round(Number(sale.total) * 100);
  }
  return [...groups.values()];
}

export function getOrderDishes(dishes, order) {
  const choices = new Map(dishes.map((dish) => [dish.id, dish]));
  for (const item of order?.items ?? []) {
    if (item.beverage_id) continue;
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

export function orderItemName(item) { return item.beverages?.name ?? item.dishes?.name ?? (item.beverage_id ? 'Bebida' : 'Comida'); }
