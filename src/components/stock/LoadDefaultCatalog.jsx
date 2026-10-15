import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importDefaultDishes } from '../../services/catalogService';
import { defaultDishes } from '../../data/defaultDishes';
import { queryKeys } from '../../hooks/queryKeys';
import Icon from '../common/Icon';

export default function LoadDefaultCatalog({ userId }) {
  const client = useQueryClient();
  const [progress, setProgress] = useState(null);
  const importCatalog = useMutation({
    mutationFn: () => importDefaultDishes(setProgress), retry: false,
    onSettled: () => Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.dishes(userId) }),
      client.invalidateQueries({ queryKey: queryKeys.menus(userId) }),
    ]),
  });
  return <section className="section-card" aria-labelledby="default-catalog-title">
    <h2 id="default-catalog-title" className="text-2xl font-semibold"><Icon name="dish" />Comidas de El Morena</h2>
    <p className="my-4 text-lg text-stone-600">Las {defaultDishes.length} comidas con sus imágenes y precios: sopa a $3.000, once opciones a $7.000 y tres a $8.000. Las guarniciones se muestran con arroz.</p>
    <button type="button" className="libreta-button" disabled={importCatalog.isPending} onClick={() => importCatalog.mutate()}><Icon name="plus" />{importCatalog.isPending ? 'Cargando comidas…' : importCatalog.isSuccess ? 'Comprobar catálogo' : 'Cargar comidas con imágenes'}</button>
    {importCatalog.isPending && progress && <div className="mt-4"><progress className="w-full accent-green-800" value={progress.current} max={progress.total} aria-label="Carga del catálogo" /><p role="status" className="mt-2 text-lg">{progress.current} de {progress.total}: {progress.name}</p></div>}
    {importCatalog.error && <p role="alert" className="mt-4 text-lg text-red-800">{importCatalog.error.message}</p>}
    {importCatalog.isSuccess && <p role="status" className="mt-4 text-lg text-green-900">Catálogo cargado: {importCatalog.data.created} comidas nuevas y {importCatalog.data.imagesAdded} fotos agregadas. Se conservaron las comidas que ya tenían imagen o estaban ocultas.</p>}
    <details className="mt-5"><summary className="cursor-pointer text-lg font-semibold">Ver comidas e imágenes</summary><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{defaultDishes.map((dish) => <article key={dish.slug} className="overflow-hidden rounded-2xl border border-stone-200"><img src={`${import.meta.env.BASE_URL}${dish.image.replace(/^\//, '')}`} alt={dish.name} loading="lazy" className="aspect-square w-full object-cover" /><div className="p-3"><h3 className="break-words text-lg">{dish.name}</h3><p className="mt-2">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(dish.price)}</p></div></article>)}</div></details>
  </section>;
}
