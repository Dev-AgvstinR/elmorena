export function validateBeverage({ name, price, quantity = 0 }) {
  const cleanName = name.trim();
  const value = Number(String(price).trim().replace(',', '.'));
  const units = Number(quantity);
  if (!cleanName || cleanName.length > 120) throw new Error('Escribí un nombre de hasta 120 caracteres.');
  if (!String(price).trim() || !Number.isFinite(value) || value < 0 || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > .0001) throw new Error('Ingresá un precio válido con hasta dos decimales, sin separadores de miles.');
  if (!Number.isInteger(units) || units < 0 || units > 1000000) throw new Error('El stock debe ser un entero entre 0 y 1000000.');
  return { name: cleanName, price: value, stock_quantity: units };
}
