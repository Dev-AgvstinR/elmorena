import { supabase } from './supabaseClient';
import { requireUser } from './authService';
import { validateBeverage } from '../utils/stock';

export async function getBeverages() {
  const user = await requireUser();
  const { data, error } = await supabase.from('beverages').select('*').eq('user_id', user.id).eq('is_active', true).order('name');
  if (error) throw error;
  return data;
}
export async function saveBeverage({ id, editing, ...input }) {
  const values = validateBeverage(input);
  const user = await requireUser();
  const request = editing
    ? supabase.from('beverages').update({ name: values.name, price: values.price }).eq('id', id).eq('user_id', user.id)
    : supabase.from('beverages').insert({ ...values, id, user_id: user.id });
  const { data, error } = await request.select().single();
  if (error) {
    // Permite reintentar una creación cuya respuesta se perdió sin duplicar la bebida.
    if (!editing && error.code === '23505') {
      const retry = await supabase.from('beverages').select('*').eq('id', id).eq('user_id', user.id).single();
      if (!retry.error) return retry.data;
    }
    throw error;
  }
  return data;
}
export async function adjustBeverageStock({ id, delta }) {
  if (!Number.isInteger(delta) || !delta || Math.abs(delta) > 1000000) throw new Error('Ingresá una cantidad entera entre 1 y 1000000.');
  const { data, error } = await supabase.rpc('adjust_beverage_stock', { p_id: id, p_delta: delta });
  if (error) throw error;
  return data;
}
export async function hideBeverage(id) {
  const user = await requireUser();
  const { data, error } = await supabase.from('beverages').update({ is_active: false }).eq('id', id).eq('user_id', user.id).select().single();
  if (error) throw error;
  return data;
}
