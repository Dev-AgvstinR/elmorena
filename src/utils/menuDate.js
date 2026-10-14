export function getMenuDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function buildMenuRows(userId, date, selectedIds, existingIds) {
  const selected = new Set(selectedIds);
  if (!selected.size) throw new Error('Elegí al menos una comida para hoy.');
  return [...new Set([...existingIds, ...selected])].map((dishId) => ({
    user_id: userId, menu_date: date, dish_id: dishId, is_available: selected.has(dishId),
  }));
}
