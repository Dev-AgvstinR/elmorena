import Icon from "../common/Icon";
import { useState } from "react";
import { getDishImageUrl } from "../../services/dishService";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});
export default function DishCard({
  dish,
  onEdit,
  onArchive,
  pending,
  soldCount,
  readOnly = false,
}) {
  const [failed, setFailed] = useState(false);
  const url = getDishImageUrl(dish.image_path);
  return (
    <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
      {url && !failed ? (
        <img
          src={url}
          alt={dish.name}
          loading="lazy"
          className="h-48 w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-48 items-center justify-center bg-stone-100 text-lg text-stone-600">
          <Icon name="dish" />
          Sin foto
        </div>
      )}
      <div className="p-6">
        <h3 className="break-words text-2xl font-semibold">{dish.name}</h3>
        <p className="my-4 text-2xl">{money.format(Number(dish.price))}</p>
        {soldCount !== undefined && <p className="mb-4 rounded-xl bg-stone-50 px-4 py-3 text-lg text-stone-700">Vendidos hoy: <strong className="text-xl tabular-nums text-stone-900">{new Intl.NumberFormat('es-AR').format(soldCount)}</strong></p>}
        {!readOnly && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => onEdit(dish)}
              className="libreta-secondary"
              aria-label={`Editar ${dish.name}`}
            >
              <Icon name="edit" />
              Editar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onArchive(dish)}
              className="libreta-secondary"
              aria-label={`Ocultar ${dish.name}`}
            >
              <Icon name="hide" />
              Ocultar
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
