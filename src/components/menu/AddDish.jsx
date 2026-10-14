import Icon from '../common/Icon';
import { useEffect, useRef, useState } from 'react';
import { useDishMutations } from '../../hooks/mutations/useDishMutations';

export default function AddDish({ userId, dish = null, onClose, onSaved }) {
  const { create, update } = useDishMutations(userId);
  const mutation = dish ? update : create;
  const nameRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function choosePhoto(event) {
    const file = event.target.files?.[0] ?? null;
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }
  async function submit(event) {
    event.preventDefault();
    if (mutation.isPending) return;
    const values = new FormData(event.currentTarget);
    try {
      await mutation.mutateAsync({ ...(dish ? { id: dish.id } : {}), name: values.get('name'), price: values.get('price'), photo });
      onSaved(dish ? 'Comida actualizada.' : 'Comida guardada.');
    } catch { /* El error se muestra debajo del formulario. */ }
  }
  return (
    <section className="mb-8 rounded-3xl border border-stone-200 bg-white p-6" aria-labelledby="dish-form-title">
      <h2 id="dish-form-title" className="mb-5 text-2xl font-semibold">{dish ? 'Editar comida' : 'Agregar comida'}</h2>
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={mutation.isPending} className="space-y-5">
          <label className="block text-lg">Nombre<input ref={nameRef} className="libreta-input" name="name" defaultValue={dish?.name ?? ''} required /></label>
          <label className="block text-lg">Precio ($)<input className="libreta-input" name="price" inputMode="decimal" defaultValue={dish?.price ?? ''} placeholder="Ejemplo: 8500,50" required aria-describedby="price-help" /></label>
          <p id="price-help" className="text-stone-600">Sin puntos para separar miles. Hasta dos decimales.</p>
          <label className="block text-lg">Foto (opcional)<input className="libreta-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /></label>
          <p className="text-stone-600">JPG, PNG o WebP. Máximo 5 MB.{dish && ' Si no elegís otra, se conserva la foto actual.'}</p>
          {preview && <img className="h-48 w-full rounded-2xl object-cover" src={preview} alt="Vista previa de la comida" />}
        </fieldset>
        {mutation.error && <p role="alert" className="text-lg text-red-800">No se pudo guardar. {mutation.error.message}</p>}
        <div className="flex flex-wrap gap-4">
          <button disabled={mutation.isPending} className="libreta-button">{mutation.isPending ? 'Guardando…' : 'Guardar comida'}</button>
          <button type="button" disabled={mutation.isPending} className="libreta-secondary" onClick={onClose}><Icon name="cancel" />Cancelar</button>
        </div>
      </form>
    </section>
  );
}
