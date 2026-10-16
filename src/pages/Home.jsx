import { useState } from "react";
import { useDishes } from "../hooks/useDishes";
import { useDailyMenu, useMenuDate } from "../hooks/useDailyMenu";
import { useCloseDay, useDayClosure, useHistoryDay } from "../hooks/useHistory";
import DishCard from "../components/menu/DishCard";
import DailyMenuModal from "../components/menu/DailyMenuModal";
import SalesStats from "../components/sales/SalesStats";
import SalesPanel from "../components/sales/SalesPanel";
import Icon from "../components/common/Icon";
import CenteredDialog from "../components/common/CenteredDialog";
import { useBeverages } from '../hooks/useStock';
import DailySummary from '../components/sales/DailySummary';
import DailyPaymentHistory from '../components/sales/DailyPaymentHistory';

export default function Home({ userId }) {
  const dishes = useDishes(userId);
  const beverages = useBeverages(userId);
  const date = useMenuDate();
  const menu = useDailyMenu(userId, date);
  const closure = useDayClosure(userId, date);
  const closedDetails = useHistoryDay(userId, closure.data?.id);
  const finish = useCloseDay(userId);
  const [dismissedDate, setDismissedDate] = useState(null);
  const [editingDate, setEditingDate] = useState(null);
  const [orderDate, setOrderDate] = useState(null);
  const [notice, setNotice] = useState("");
  const [confirmDate, setConfirmDate] = useState(null);

  const closed = Boolean(closure.data);
  const availableIds = new Set(
    menu.data?.filter((row) => row.is_available).map((row) => row.dish_id),
  );
  const todayDishes =
    dishes.data?.filter((dish) => availableIds.has(dish.id)) ?? [];
  const hasMenu = availableIds.size > 0;
  const showMenuModal =
    closure.isSuccess &&
    !closed &&
    dishes.isSuccess &&
    menu.isSuccess &&
    (editingDate === date || (!hasMenu && dismissedDate !== date));
  const fecha = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(`${date}T12:00:00-03:00`));

  async function finishDay() {
    if (finish.isPending || confirmDate !== date) return;
    try {
      await finish.mutateAsync(date);
      setOrderDate(null);
      setEditingDate(null);
      setConfirmDate(null);
      setNotice("Día terminado. Todo quedó guardado en el historial.");
    } catch {
      /* El mensaje del servidor se muestra junto al botón. */
    }
  }

  return (
    <main className="page-content min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <p className="mb-2 text-lg capitalize text-stone-600">
            <Icon name="calendar" /> {fecha}
          </p>
          <h1 className="text-4xl font-semibold">El Morena</h1>
          <p className="mt-3 text-lg text-stone-600">
            Buen día. Acá guardás las comidas de tu local.
          </p>
        </header>

        {closure.isPending && (
          <p role="status" className="mb-5 text-lg">
            Consultando el estado del día…
          </p>
        )}
        {closure.isError && (
          <div role="alert" className="mb-6">
            <p className="text-lg text-red-800">
              No se pudo consultar el cierre del día. {closure.error.message}
            </p>
            <button
              className="libreta-secondary mt-3"
              onClick={() => closure.refetch()}
            >
              Volver a intentar
            </button>
          </div>
        )}
        {closed && (
          <section className="section-card">
            <h2 className="text-2xl font-semibold">
              <Icon name="check" />
              Día terminado
            </h2>
            <p className="mt-4 text-lg">
              El menú y los pedidos pagados quedaron guardados. Mañana podrás
              armar un nuevo menú.
            </p>
            {closedDetails.isPending && <p role="status" className="mt-5">Cargando resumen…</p>}
            {closedDetails.isError && <div role="alert" className="mt-5"><p>No se pudo cargar el resumen.</p><button type="button" className="libreta-secondary mt-3" onClick={() => closedDetails.refetch()}>Volver a intentar</button></div>}
            {closedDetails.data && <><DailyPaymentHistory sales={closedDetails.data.sales_snapshot} /><DailySummary sales={closedDetails.data.sales_snapshot} /></>}
          </section>
        )}

        {closure.isSuccess && !closed && (
          <>
            <p role="status" className="mb-5 text-lg text-green-900">
              {notice}
            </p>
            {showMenuModal && (
              <DailyMenuModal
                key={date}
                userId={userId}
                date={date}
                dishes={dishes.data}
                rows={menu.data}
                onClose={() => {
                  setDismissedDate(date);
                  setEditingDate(null);
                }}
                onSaved={() => {
                  setDismissedDate(date);
                  setEditingDate(null);
                  setNotice("Menú de hoy guardado.");
                }}
              />
            )}

            <button
              type="button"
              className="libreta-button mb-6"
              disabled={
                !menu.isSuccess ||
                !dishes.isSuccess ||
                (!todayDishes.length && !beverages.data?.some((beverage) => beverage.stock_quantity > 0)) ||
                showMenuModal ||
                finish.isPending
              }
              onClick={() => setOrderDate(date)}
            >
              <Icon name="order" />
              Realizar pedido
            </button>
            {confirmDate === date && (
              <CenteredDialog
                title="Confirmar cierre del día"
                busy={finish.isPending}
                onClose={() => setConfirmDate(null)}
              >
                <span className="libreta-icon-badge">
                  <Icon name="finish" />
                </span>
                <h2 className="text-3xl font-semibold">
                  ¿Estás seguro de terminar el día?
                </h2>
                <p className="my-5 text-lg text-stone-600">
                  El menú y los pedidos pagados se guardarán en Historial y se
                  limpiará el inicio. No podrás agregar pedidos hasta mañana.
                </p>
                <p className="mb-6 text-lg">
                  Si quedan pedidos pendientes, tendrás que resolverlos antes de
                  cerrar.
                </p>
                {finish.error && (
                  <p role="alert" className="mb-5 text-lg text-red-800">
                    {finish.error.message}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    autoFocus
                    className="libreta-secondary"
                    disabled={finish.isPending}
                    onClick={() => setConfirmDate(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="libreta-button"
                    disabled={finish.isPending}
                    onClick={finishDay}
                  >
                    <Icon name="check" />
                    {finish.isPending ? "Terminando día…" : "Sí, terminar día"}
                  </button>
                </div>
              </CenteredDialog>
            )}
            <SalesPanel
              userId={userId}
              date={date}
              dishes={todayDishes}
              orderOpen={orderDate === date && !showMenuModal}
              onCloseOrder={() => setOrderDate(null)}
            />

            <section aria-labelledby="today-title" className="section-card">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 id="today-title" className="text-2xl font-semibold">
                    <Icon name="dish" />
                    Comidas de hoy
                  </h2>
                  <p className="mt-2 text-lg text-stone-600">
                    El menú que preparás hoy en El Morena.
                  </p>
                </div>
                <button
                  className="libreta-button"
                  disabled={
                    !menu.isSuccess || !dishes.isSuccess || finish.isPending
                  }
                  onClick={() => setEditingDate(date)}
                >
                  <Icon name={hasMenu ? "edit" : "plus"} />
                  {hasMenu ? "Cambiar menú de hoy" : "Armar menú de hoy"}
                </button>
              </div>
              {menu.isPending && (
                <p role="status" className="text-lg">
                  Buscando el menú de hoy…
                </p>
              )}
              {menu.isError && (
                <div role="alert">
                  <p className="text-lg text-red-800">
                    No pudimos consultar el menú de hoy.
                  </p>
                  <button
                    className="libreta-secondary mt-3"
                    disabled={menu.isFetching}
                    onClick={() => menu.refetch()}
                  >
                    Volver a intentar
                  </button>
                </div>
              )}
              {dishes.isError && (
                <div role="alert">
                  <p className="text-lg text-red-800">
                    No pudimos cargar las comidas.
                  </p>
                  <button
                    className="libreta-secondary mt-3"
                    disabled={dishes.isFetching}
                    onClick={() => dishes.refetch()}
                  >
                    Volver a intentar
                  </button>
                </div>
              )}
              {menu.isSuccess && dishes.isSuccess && !todayDishes.length && (
                <p className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-lg">
                  Todavía no hay comidas disponibles para hoy. Elegilas en
                  “Armar menú de hoy”.
                </p>
              )}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {todayDishes.map((dish) => (
                  <DishCard
                    key={`${dish.id}-${dish.image_path}`}
                    dish={dish}
                    readOnly
                  />
                ))}
              </div>
            </section>
            <SalesStats
              userId={userId}
              date={date}
              actions={
                <button
                  type="button"
                  className="libreta-secondary"
                  disabled={
                    finish.isPending || orderDate === date || showMenuModal
                  }
                  onClick={() => {
                    finish.reset();
                    setConfirmDate(date);
                  }}
                >
                  <Icon name="finish" />
                  Terminar día
                </button>
              }
            />
          </>
        )}
      </div>
    </main>
  );
}
