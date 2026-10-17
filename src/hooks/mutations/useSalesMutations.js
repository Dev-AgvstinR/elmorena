import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPendingSale, paySale, editOrder, deleteOrder, markOrderFiado } from '../../services/salesService';
import { queryKeys } from '../queryKeys';

export function useSalesMutations(userId) {
  const client = useQueryClient();
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.sales(userId) }),
    client.invalidateQueries({ queryKey: queryKeys.fiados(userId) }),
    client.invalidateQueries({ queryKey: ['beverages', userId] }),
  ]);
  const create = useMutation({ mutationFn: createPendingSale, meta: { successMessage: 'Pedido agregado a pendientes.' }, retry: false, onSettled: refresh });
  const pay = useMutation({ mutationFn: paySale, meta: { successMessage: 'Pago registrado.' }, retry: false, onSettled: refresh });
  const edit = useMutation({ mutationFn: editOrder, meta: { successMessage: 'Pedido actualizado.' }, retry: false, onSettled: refresh });
  const remove = useMutation({ mutationFn: deleteOrder, meta: { successMessage: 'Pedido eliminado.' }, retry: false, onSettled: refresh });
  const markFiado = useMutation({ mutationFn: markOrderFiado, meta: { successMessage: 'Pedido agregado a Fiados.' }, retry: false, onSettled: refresh });
  return { create, pay, edit, remove, markFiado };
}

