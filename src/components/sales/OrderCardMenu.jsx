import { useEffect, useRef, useState } from 'react';
import Icon from '../common/Icon';

export default function OrderCardMenu({ order, isPaid, disabled, onEdit, onDelete, onFiado }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const canAddToFiados = !isPaid && !order.isFiado;

  useEffect(() => {
    if (!open) return undefined;
    function closeOutside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function choose(action) {
    setOpen(false);
    action();
  }

  return <div ref={root} className="sales-card-menu">
    <button type="button" className="sales-card-menu-trigger" aria-label={`Más opciones para ${order.reference || 'este pedido'}`} aria-expanded={open} aria-haspopup="menu" disabled={disabled} onClick={() => setOpen((value) => !value)}>
      <Icon name="more" />
    </button>
    {open && <div className="sales-card-menu-items" aria-label={`Opciones de ${order.reference || 'pedido'}`}>
      <button type="button" onClick={() => choose(onEdit)}><Icon name="edit" />Editar</button>
      <button type="button" className="is-danger" onClick={() => choose(onDelete)}><Icon name="delete" />Eliminar</button>
      <button type="button" className="is-danger" disabled={!canAddToFiados} title={canAddToFiados ? undefined : order.isFiado ? 'Este pedido ya está en Fiados' : 'Solo se pueden agregar pedidos sin cobrar'} onClick={() => choose(onFiado)}><Icon name="pending" />Agregar a Fiados</button>
    </div>}
  </div>;
}
