import { supabase } from './supabaseClient';
import { requireLocal } from './localService';

export async function getDayClosure(date) {
  const user = await requireLocal();
  const { data, error } = await supabase.from('day_closures').select('id,business_date,closed_at')
    .eq('user_id', user.id).eq('business_date', date).maybeSingle();
  if (error) throw error;
  return data;
}
export async function getHistory(beforeDate = null) {
  const user = await requireLocal();
  let request = supabase.from('day_closures').select('id,business_date,closed_at')
    .eq('user_id', user.id).order('business_date', { ascending: false }).limit(20);
  if (beforeDate) request = request.lt('business_date', beforeDate);
  const { data, error } = await request;
  if (error) throw error;
  return { days: data, nextDate: data.length === 20 ? data.at(-1).business_date : undefined };
}
export async function getHistoryDay(id) {
  const user = await requireLocal();
  const { data, error } = await supabase.from('day_closures').select('*').eq('user_id', user.id).eq('id', id).single();
  if (error) throw error;
  return data;
}
export async function closeDay(date) {
  const { data, error } = await supabase.rpc('close_day', { p_date: date });
  if (error) throw error;
  return data;
}

