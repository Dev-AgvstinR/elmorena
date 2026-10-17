import Icon from '../components/common/Icon';
import SalesPanel from '../components/sales/SalesPanel';
import { useMenuDate } from '../hooks/useDailyMenu';
import { useEmpanadaPrices } from '../hooks/useEmpanadas';

export default function Fiados({ userId }) {
  const date = useMenuDate();
  const empanadas = useEmpanadaPrices(userId);
  return <main className="page-content min-h-screen px-5 py-8 md:px-10">
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <h1 className="text-4xl font-semibold"><Icon name="pending" />Fiados</h1>
        <p className="mt-3 text-lg text-stone-600">Pedidos anotados para cobrar más adelante. Se cuentan como vendidos al agregarlos y se registran como cobro el día que los paguen.</p>
      </header>
      {empanadas.isError && <p role="alert" className="mb-4 text-red-800">No se pudieron cargar los precios de empanadas. {empanadas.error.message}</p>}
      <SalesPanel
        userId={userId}
        date={date}
        dishes={[]}
        empanadaPrices={empanadas.data ?? []}
        orderOpen={false}
        onCloseOrder={() => {}}
        showPendingList={false}
        showPaidList={false}
        showFiadosList
      />
    </div>
  </main>;
}
