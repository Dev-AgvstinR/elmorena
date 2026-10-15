import { supabase } from './supabaseClient';
import { requireLocal } from './localService';

const BUCKET = 'dish-images';
const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function validateDish({ name, price }) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanPrice = typeof price === 'number' ? price : Number(String(price).trim().replace(',', '.'));
  if (!cleanName) throw new Error('Escribí el nombre de la comida.');
  if (price == null || String(price).trim() === '' || !Number.isFinite(cleanPrice) || cleanPrice < 0 || cleanPrice > 9999999999.99) {
    throw new Error('Ingresá un precio válido, mayor o igual a cero, sin separadores de miles.');
  }
  if (Math.abs(cleanPrice * 100 - Math.round(cleanPrice * 100)) > 0.0001) {
    throw new Error('El precio puede tener hasta dos decimales.');
  }
  return { name: cleanName, price: cleanPrice };
}

async function uploadPhoto(file, userId) {
  if (!types[file.type]) throw new Error('Elegí una foto JPG, PNG o WebP.');
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('La foto debe pesar entre 1 byte y 5 MB.');
  const path = `${userId}/${crypto.randomUUID()}.${types[file.type]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type, upsert: false,
  });
  if (error) throw error;
  return path;
}

async function cleanupUpload(path, originalError) {
  if (path) {
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw error;
    } catch {
      throw new Error('No se pudo guardar la comida ni retirar la foto subida. Revisá Storage antes de reintentar.', { cause: originalError });
    }
  }
  throw originalError;
}

export function getDishImageUrl(path) {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function getDishes() {
  const user = await requireLocal();
  const { data, error } = await supabase.from('dishes').select('*')
    .eq('user_id', user.id).eq('is_active', true).order('name');
  if (error) throw error;
  return data;
}

export async function createDish({ name, price, photo = null }) {
  const values = validateDish({ name, price });
  const user = await requireLocal();
  const path = photo ? await uploadPhoto(photo, user.id) : null;
  const { data, error } = await supabase.from('dishes').insert({
    ...values, user_id: user.id, image_path: path,
  }).select().single();
  if (error) return cleanupUpload(path, error);
  return data;
}

// photo omitida: conserva la foto; photo nueva: la reemplaza.
export async function updateDish(id, { name, price, photo = null }) {
  const values = validateDish({ name, price });
  const user = await requireLocal();
  const path = photo ? await uploadPhoto(photo, user.id) : null;
  const { data, error } = await supabase.from('dishes').update({
    ...values, ...(path ? { image_path: path } : {}),
  }).eq('id', id).eq('user_id', user.id).select().single();
  if (error) return cleanupUpload(path, error);
  // Se conserva el archivo anterior para evitar borrar una imagen aún en uso.
  return data;
}

// Baja lógica: mantiene las referencias desde ventas y respeta las políticas existentes.
export async function archiveDish(id) {
  const user = await requireLocal();
  const { data, error } = await supabase.from('dishes').update({ is_active: false })
    .eq('id', id).eq('user_id', user.id).select().single();
  if (error) throw error;
  return data;
}

