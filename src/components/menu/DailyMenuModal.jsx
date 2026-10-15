import Icon from '../common/Icon';
import { useEffect, useRef, useState } from "react";
import { useSaveDailyMenu } from "../../hooks/mutations/useSaveDailyMenu";
import AddDish from "./AddDish";

export default function DailyMenuModal({
  userId,
  date,
  dishes,
  rows,
  onClose,
  onSaved,
}) {
  const dialogRef = useRef(null);
  const [expectedIds] = useState(() => rows.filter((row) => row.is_available).map((row) => row.dish_id));
  const [selected, setSelected] = useState(() =>
    rows.filter((row) => row.is_available).map((row) => row.dish_id),
  );
  const [adding, setAdding] = useState(false);
  const save = useSaveDailyMenu(userId, date);
  const validIds = selected.filter((id) =>
    dishes.some((dish) => dish.id === id),
  );
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  function toggle(id) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  async function submit(event) {
    event.preventDefault();
    if (save.isPending) return;
    try {
      await save.mutateAsync({ date, dishIds: validIds, expectedIds });
      onSaved();
    } catch {
      /* Se conserva la selección y se muestra el error para reintentar. */
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="daily-menu-dialog fixed z-10 m-auto shadow-2xl"
      aria-labelledby="daily-menu-title"
      aria-describedby="daily-menu-help"
      onCancel={(event) => {
        event.preventDefault();
        if (!save.isPending && !adding) onClose();
      }}
    >
      <h2 id="daily-menu-title" className="text-3xl font-semibold"><Icon name="dish" />¿Qué vas a cocinar hoy?</h2>
      <p className="mt-3 text-lg capitalize text-stone-600">
        {new Intl.DateTimeFormat("es-AR", {
          dateStyle: "full",
          timeZone: "America/Argentina/Buenos_Aires",
        }).format(new Date(`${date}T12:00:00-03:00`))}
      </p>
      <p id="daily-menu-help" className="my-5 text-lg text-stone-600">
        Marcá las comidas de hoy. Podés cambiar el menú más tarde.
      </p>
      {adding ? (
        <AddDish
          userId={userId}
          onClose={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      ) : (
        <>
          <form onSubmit={submit} className="space-y-5">
            <fieldset disabled={save.isPending} className="space-y-3">
              <legend className="sr-only">
                Comidas disponibles para elegir
              </legend>
              {dishes.length === 0 && (
                <p className="text-lg">
                  Primero agregá una comida con su nombre y precio.
                </p>
              )}
              {dishes.map((dish) => (
                <label
                  key={dish.id}
                  className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 text-xl ${selected.includes(dish.id) ? "border-green-800 bg-green-50" : "border-stone-300"}`}
                >
                  <input
                    type="checkbox"
                    className="h-6 w-6 shrink-0 accent-green-800"
                    checked={selected.includes(dish.id)}
                    onChange={() => toggle(dish.id)}
                  />
                  <span className="break-words">{dish.name}</span>
                </label>
              ))}
            </fieldset>
            {save.error && (
              <p role="alert" className="text-lg text-red-800">
                No se pudo guardar el menú. {save.error.message}
              </p>
            )}
            <p role="status" className="text-lg">
              {validIds.length}{" "}
              {validIds.length === 1 ? "comida elegida" : "comidas elegidas"}
            </p>
            <button
              type="submit"
              disabled={save.isPending || !validIds.length}
              className="libreta-button w-full"
            >
              {save.isPending ? "Guardando…" : "Guardar menú de hoy"}
            </button>
            <button type="button" className="libreta-secondary w-full" disabled={save.isPending} onClick={onClose}>Cancelar</button>
          </form>
          <button
            type="button"
            className="libreta-secondary mt-4 w-full"
            disabled={save.isPending}
            onClick={() => setAdding(true)}
          ><Icon name="plus" />Agregar una comida nueva</button>
        </>
      )}
    </dialog>
  );
}
