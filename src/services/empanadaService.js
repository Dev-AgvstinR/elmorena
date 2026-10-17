import { supabase } from './supabaseClient';
import { requireLocal } from './localService';

const FLAVORS = ['carne', 'pollo'];

export async function getEmpanadaPrices() {
  const user = await requireLocal();
  const { data, error } = await supabase.from('empanada_prices').select('*')
    .eq('user_id', user.id).order('flavor');
  if (error) throw error;
  return data;
}

export async function saveEmpanadaPrices(prices) {
  const user = await requireLocal();
  if (!Array.isArray(prices) || prices.length !== FLAVORS.length) throw new Error('Completá los precios de carne y pollo.');
  const rows = prices.map((row) => {
    if (!FLAVORS.includes(row.flavor)) throw new Error('Elegí carne o pollo.');
    const clean = {};
    for (const size of [1, 12]) {
      const raw = String(row[`price_${size}`] ?? '').trim().replace(',', '.');
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value <= 0 || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001) {
        throw new Error('Ingresá precios mayores que cero, con hasta dos decimales.');
      }
      clean[`price_${size}`] = value;
    }
    clean.price_6 = Math.round(clean.price_12 * 50) / 100;
    return { user_id: user.id, flavor: row.flavor, ...clean };
  });
  const { data, error } = await supabase.from('empanada_prices').upsert(rows, { onConflict: 'user_id,flavor' }).select();
  if (error) throw error;
  return data;
}
