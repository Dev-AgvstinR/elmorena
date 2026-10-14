import { supabase } from './supabaseClient';
import { requireUser } from './authService';
import { buildMenuRows, getMenuDate } from '../utils/menuDate';

export async function getDailyMenu(date) {
  const user = await requireUser();
  const { data, error } = await supabase.from('daily_menu').select('*')
    .eq('user_id', user.id).eq('menu_date', date);
  if (error) throw error;
  return data;
}

export async function saveDailyMenu({ date, dishIds }) {
  if (date !== getMenuDate()) throw new Error('Cambió el día. Cerrá este formulario y armá el menú de hoy.');
  const user = await requireUser();
  const existing = await getDailyMenu(date);
  const rows = buildMenuRows(user.id, date, dishIds, existing.map((row) => row.dish_id));
  // Un único upsert guarda la selección completa; conserva las filas anteriores como no disponibles.
  const { data, error } = await supabase.from('daily_menu').upsert(rows, {
    onConflict: 'user_id,menu_date,dish_id',
  }).select();
  if (error) throw error;
  return data;
}
