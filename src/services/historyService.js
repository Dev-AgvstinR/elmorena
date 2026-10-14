import { supabase } from './supabaseClient';
import { requireUser } from './authService';

export async function getDayClosure(date) {
  const user = await requireUser();
  const { data, error } = await supabase.from('day_closures').select('id,business_date,closed_at')
    .eq('user_id', user.id).eq('business_date', date).maybeSingle();
  if (error) throw error;
  return data;
}
export async function getHistory() {
  const user = await requireUser();
  const { data, error } = await supabase.from('day_closures').select('*')
    .eq('user_id', user.id).order('business_date', { ascending: false });
  if (error) throw error;
  return data;
}
export async function closeDay(date) {
  const { data, error } = await supabase.rpc('close_day', { p_date: date });
  if (error) throw error;
  return data;
}
