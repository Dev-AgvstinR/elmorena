import { supabase } from './supabaseClient';
import { validateCart } from '../utils/sales';
import { explainSchemaError } from '../utils/schemaError';

export async function getSalesPage(date, state, offset = 0) {
  const { data, error } = await supabase.rpc('sales_page', { p_date: date, p_state: state, p_offset: offset, p_limit: 20 });
  if (error) throw explainSchemaError(error, 'sales_page');
  return { ...data, nextOffset: data.hasMore ? offset + 20 : undefined };
}

export async function getSalesSummary(date) {
  const { data, error } = await supabase.rpc('sales_summary', { p_date: date });
  if (error) throw explainSchemaError(error, 'sales_summary');
  return data;
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

