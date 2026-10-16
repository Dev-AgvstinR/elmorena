import { supabase } from './supabaseClient';
import { requireLocal } from './localService';
import { getMenuDate } from '../utils/menuDate';
import { explainSchemaError } from '../utils/schemaError';

export async function getDailyMenu(date) {
  const user = await requireLocal();
  const { data, error } = await supabase.from('daily_menu').select('*')
    .eq('user_id', user.id).eq('menu_date', date);
  if (error) throw explainSchemaError(error);
  return data;
}

export async function saveDailyMenu({ date, dishIds, expectedIds }) {
  if (date !== getMenuDate()) throw new Error('Cambió el día. Cerrá este formulario y armá el menú de hoy.');
  const { data, error } = await supabase.rpc('save_daily_menu', {
    p_date: date, p_dish_ids: dishIds, p_expected_ids: expectedIds,
  });
  if (error) throw explainSchemaError(error, 'save_daily_menu');
  return data;
}

