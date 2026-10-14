import { useState } from 'react';
import { useDishes } from '../hooks/useDishes';
import { useDishMutations } from '../hooks/mutations/useDishMutations';
import { useStock } from '../hooks/useStock';
import AddDish from '../components/menu/AddDish';
import DishCard from '../components/menu/DishCard';
import Icon from '../components/common/Icon';
import CenteredDialog from '../components/common/CenteredDialog';
import BeverageForm from '../components/stock/BeverageForm';
import StockAdjustment from '../components/stock/StockAdjustment';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
export default function Stock({ userId }) {
  const dishes = useDishes(userId);
  const { archive } = useDishMutations(userId);
  const stock = useStock(userId);
  const [tab, setTab] = useState('beverages');
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const busy = stock.save.isPending || stock.adjust.isPending || stock.hide.isPending || archive.isPending;
  function saved(message) { setModal(null); setNotice(message); }
  async function hide(id, isDish) {
    setError(''); setNotice('');
    try { await (isDish ? archive.mutateAsync(id) : stock.hide.mutateAsync(id)); setNotice(isDish ? 'Comida oculta del catálogo.' : 'Bebida oculta del stock.'); }
    catch (failure) { setError(failure.message); }
  }
  return <main className="min-h-screen px-5 py-8 md:px-10"><div className="mx-auto max-w-5xl">
    <header className="mb-8"><p className="mb-2 text-lg text-stone-600">Todo listo para cocinar y servir</p><h1 className="text-4xl font-semibold"><Icon name="stock" />Stock</h1><p className="mt-3 max-w-2xl text-lg text-stone-600">Controlá tus bebidas y administrá las comidas que podés reutilizar en el menú de cada día.</p></header>
    <div className="stock-switch mb-8" aria-label="Categoría de stock"><button className={tab === 'beverages' ? 'is-active' : ''} aria-pressed={tab === 'beverages'} onClick={() => setTab('beverages')}><Icon name="drink" />Bebidas</button><button className={tab === 'dishes' ? 'is-active' : ''} aria-pressed={tab === 'dishes'} onClick={() => setTab('dishes')}><Icon name="dish" />Comidas</button></div>
    <p role="status" className="mb-4 text-lg text-green-900">{notice}</p>{error && <p role="alert" className="mb-4 text-lg text-red-800">{error}</p>}
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold">{tab === 'beverages' ? 'Bebidas disponibles' : 'Comidas guardadas'}</h2><button className="libreta-button" disabled={busy} onClick={() => setModal({ type: tab === 'beverages' ? 'beverage' : 'dish', item: null })}><Icon name="plus" />{tab === 'beverages' ? 'Agregar bebida' : 'Agregar comida'}</button></div>
    {tab === 'beverages' ? <>
      {stock.query.isPending && <p role="status">Cargando bebidas…</p>}
      {stock.query.isError && <div role="alert" className="rounded-3xl border border-stone-200 bg-white p-6"><p className="text-lg text-red-800">No se pudieron cargar las bebidas. Si es la primera vez, ejecutá stock-bebidas.sql en Supabase.</p><button className="libreta-secondary mt-4" onClick={() => stock.query.refetch()}>Volver a intentar</button></div>}
      {stock.query.isSuccess && !stock.query.data.length && <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 text-center"><span className="libreta-icon-badge"><Icon name="drink" /></span><h3 className="text-2xl">Todavía no hay bebidas</h3><p className="mt-3 text-lg text-stone-600">Agregá la primera con su precio y las unidades disponibles.</p></div>}
      <div className="grid gap-5 sm:grid-cols-2">{stock.query.data?.map((beverage) => <article key={beverage.id} className="rounded-3xl border border-stone-200 bg-white p-6"><span className="libreta-icon-badge"><Icon name="drink" /></span><h3 className="break-words text-2xl font-semibold">{beverage.name}</h3><p className="mt-2 text-xl">{money.format(Number(beverage.price))}</p><p className={`my-5 text-xl font-bold ${beverage.stock_quantity === 0 ? 'text-red-800' : 'text-green-900'}`}>{beverage.stock_quantity} unidades{beverage.stock_quantity === 0 && ' · Sin stock'}</p><div className="flex flex-wrap gap-3"><button className="libreta-button" disabled={busy} onClick={() => setModal({ type: 'adjust', item: beverage })}><Icon name="stock" />Actualizar stock</button><button className="libreta-secondary" disabled={busy} onClick={() => setModal({ type: 'beverage', item: beverage })}><Icon name="edit" />Editar</button><button className="libreta-secondary" disabled={busy} onClick={() => hide(beverage.id, false)}><Icon name="hide" />Ocultar</button></div></article>)}</div>
    </> : <>
      <p className="mb-5 text-lg text-stone-600">Estas comidas estarán disponibles al armar el menú diario. Ocultarlas conserva sus ventas anteriores.</p>
      {dishes.isPending && <p role="status">Cargando comidas…</p>}
      {dishes.isError && <div role="alert"><p>No se pudieron cargar las comidas.</p><button className="libreta-secondary mt-3" onClick={() => dishes.refetch()}>Volver a intentar</button></div>}
      {dishes.isSuccess && !dishes.data.length && <p className="rounded-3xl bg-white p-8 text-lg">Todavía no guardaste comidas. Agregá la primera para empezar.</p>}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{dishes.data?.map((dish) => <DishCard key={`${dish.id}-${dish.image_path}`} dish={dish} pending={busy} onEdit={(item) => setModal({ type: 'dish', item })} onArchive={(item) => hide(item.id, true)} />)}</div>
    </>}
    {modal && <CenteredDialog title={modal.type === 'dish' ? 'Administrar comida' : 'Administrar bebida'} busy={busy} onClose={() => setModal(null)}>
      {modal.type === 'dish' ? <AddDish userId={userId} dish={modal.item} onClose={() => setModal(null)} onSaved={saved} /> : modal.type === 'adjust' ? <StockAdjustment beverage={modal.item} mutation={stock.adjust} onClose={() => setModal(null)} onSaved={saved} /> : <BeverageForm beverage={modal.item} mutation={stock.save} onClose={() => setModal(null)} onSaved={saved} />}
    </CenteredDialog>}
  </div></main>;
}
