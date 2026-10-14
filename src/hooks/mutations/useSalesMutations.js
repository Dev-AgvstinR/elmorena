import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPendingSale, paySale, editOrder, deleteOrder } from '../../services/salesService';
import { queryKeys } from '../queryKeys';

export function useSalesMutations(userId) {
  const client = useQueryClient();
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.sales(userId) }),
    client.invalidateQueries({ queryKey: ['beverages', userId] }),
  ]);
  const create = useMutation({ mutationFn: createPendingSale, retry: false, onSettled: refresh });
  const pay = useMutation({ mutationFn: paySale, retry: false, onSettled: refresh });
  const edit = useMutation({ mutationFn: editOrder, retry: false, onSettled: refresh });
  const remove = useMutation({ mutationFn: deleteOrder, retry: false, onSettled: refresh });
  return { create, pay, edit, remove };
}
