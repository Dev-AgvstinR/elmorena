import { supabase } from './supabaseClient';
import { requireLocal } from './localService';
import { explainSchemaError } from '../utils/schemaError';

export async function getDailyExpenses(date) {
  const user = await requireLocal();
  const { data, error } = await supabase.from('daily_expenses').select('id,description,amount,payment_method,created_at')
    .eq('user_id', user.id).eq('business_date', date).order('created_at', { ascending: false });
  if (error) throw explainSchemaError(error, 'daily_expenses');
  return data;
}

export async function addDailyExpense({ date, description, amount, method }) {
  const { data, error } = await supabase.rpc('add_daily_expense', {
    p_date: date, p_description: description, p_amount: amount, p_method: method,
  });
  if (error) throw explainSchemaError(error, 'add_daily_expense');
  return data;
}

export async function deleteDailyExpense(id) {
  const { error } = await supabase.rpc('delete_daily_expense', { p_id: id });
  if (error) throw explainSchemaError(error, 'delete_daily_expense');
}
