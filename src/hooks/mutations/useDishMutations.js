import { useMutation, useQueryClient } from '@tanstack/react-query';
import { archiveDish, createDish, updateDish } from '../../services/dishService';
import { queryKeys } from '../queryKeys';

export function useDishMutations(userId) {
  const client = useQueryClient();
  const onSuccess = () => Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.dishes(userId) }),
    client.invalidateQueries({ queryKey: queryKeys.menus(userId) }),
    client.invalidateQueries({ queryKey: queryKeys.sales(userId) }),
  ]);
  const create = useMutation({ mutationFn: createDish, meta: { successMessage: 'Comida guardada.' }, onSuccess, retry: false });
  const update = useMutation({ mutationFn: ({ id, ...values }) => updateDish(id, values), meta: { successMessage: 'Comida actualizada.' }, onSuccess, retry: false });
  const archive = useMutation({ mutationFn: archiveDish, meta: { successMessage: 'Comida oculta.' }, onSuccess, retry: false });
  return { create, update, archive };
}

