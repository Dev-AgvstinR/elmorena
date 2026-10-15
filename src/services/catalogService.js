import { supabase } from './supabaseClient';
import { requireLocal } from './localService';
import { defaultDishes } from '../data/defaultDishes';
import { catalogDishId, normalizeDishName } from '../utils/catalog';

export async function importDefaultDishes(onProgress = () => {}) {
  const user = await requireLocal();
  const existing = await supabase.from('dishes').select('*').eq('user_id', user.id);
  if (existing.error) throw existing.error;
  const byName = new Map(existing.data.map((dish) => [normalizeDishName(dish.name), dish]));
  const byId = new Map(existing.data.map((dish) => [dish.id, dish]));
  const folder = `${user.id}/catalogo-elmorena`;
  const summary = { created: 0, imagesAdded: 0, skipped: 0 };
  for (const [index, dish] of defaultDishes.entries()) {
    onProgress({ current: index + 1, total: defaultDishes.length, name: dish.name });
    try {
      const id = await catalogDishId(user.id, dish.slug);
      const found = byId.get(id) ?? byName.get(normalizeDishName(dish.name));
      if (found && (!found.is_active || found.image_path)) { summary.skipped++; continue; }
      const response = await fetch(`${import.meta.env.BASE_URL}${dish.image.replace(/^\//, '')}`);
      if (!response.ok) throw new Error('No se encontró la imagen del catálogo.');
      const photo = await response.blob();
      if (photo.type !== 'image/png' || !photo.size || photo.size > 5 * 1024 * 1024) throw new Error('La imagen no es PNG o supera los 5 MB.');
      const imagePath = `${folder}/${dish.slug}.png`;
      const upload = await supabase.storage.from('dish-images').upload(imagePath, photo, { contentType: 'image/png', upsert: false });
      if (upload.error && String(upload.error.statusCode) !== '409') throw upload.error;
      if (found) {
        const result = await supabase.from('dishes').update({ image_path: imagePath }).eq('id', found.id).eq('user_id', user.id).is('image_path', null).select();
        if (result.error) throw result.error;
        summary.imagesAdded += result.data.length;
      } else {
        const result = await supabase.from('dishes').insert({ id, user_id: user.id, name: dish.name, price: dish.price, image_path: imagePath });
        if (result.error && result.error.code !== '23505') throw result.error;
        if (result.error) summary.skipped++; else summary.created++;
      }
    } catch (failure) {
      throw new Error(`No se pudo cargar “${dish.name}”. ${failure.message} Ya se guardaron ${summary.created} comidas nuevas. Podés reintentar sin duplicarlas.`, { cause: failure });
    }
  }
  return summary;
}

