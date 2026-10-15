import { supabase } from './supabaseClient';
import { requireUser } from './authService';
import { paymentDayRange, validateCart } from '../utils/sales';

export async function getSales(date) {
  const user = await requireUser();
  const { start, end } = paymentDayRange(date);
  const select = '*, dishes(name), beverages(name)';
  const results = await Promise.all([
    supabase.from('sales').select(select).eq('user_id', user.id).eq('status', 'vigente')
      .eq('payment_status', 'pendiente').order('created_at'),
    supabase.from('sales').select(select).eq('user_id', user.id).eq('status', 'vigente')
      .eq('payment_status', 'pagado').is('closed_day', null).gte('paid_at', start).lt('paid_at', end).order('paid_at', { ascending: false }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return { pending: results[0].data, paid: results[1].data };
}

export async function createPendingSale({ id, ...input }) {
  const order = validateCart(input);
  const { data, error } = await supabase.rpc('create_pending_order', {
    p_id: id, p_items: order.items.map((item) => ({ dish_id: item.dishId ?? null, beverage_id: item.beverageId ?? null, quantity: item.quantity })), p_reference: order.reference,
  });
  if (error) throw error;
  return data;
}

export async function paySale({ id, method, cashAmount, transferAmount, revision }) {
  const request = method === 'mixto'
    ? supabase.rpc('pay_order_split', { p_id: id, p_cash: cashAmount, p_transfer: transferAmount, p_revision: revision })
    : supabase.rpc('pay_order', { p_id: id, p_method: method });
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

export async function editOrder({ id, revision, state, method, cashAmount, transferAmount, ...input }) {
  const order = validateCart(input);
  const { data, error } = await supabase.rpc('edit_order_payment', {
    p_id: id, p_revision: revision, p_state: state, p_method: method ?? null,
    p_reference: order.reference,
    p_cash: cashAmount ?? null, p_transfer: transferAmount ?? null,
    p_items: order.items.map((item) => ({ dish_id: item.dishId ?? null, beverage_id: item.beverageId ?? null, quantity: item.quantity })),
  });
  if (error) throw error;
  return data;
}

export async function deleteOrder({ id, revision }) {
  const { error } = await supabase.rpc('delete_order', { p_id: id, p_revision: revision });
  if (error) throw error;
}
