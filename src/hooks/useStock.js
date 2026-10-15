import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adjustBeverageStock, getBeverages, hideBeverage, saveBeverage } from '../services/stockService';

export function useStock(userId) {
  const client = useQueryClient();
  const key = ['beverages', userId];
  const query = useQuery({ queryKey: key, queryFn: getBeverages, enabled: Boolean(userId), retry: false, refetchOnWindowFocus: true, refetchInterval: 30000 });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const save = useMutation({ mutationFn: saveBeverage, meta: { successMessage: 'Bebida guardada.' }, onSuccess: refresh, retry: false });
  const adjust = useMutation({ mutationFn: adjustBeverageStock, meta: { successMessage: 'Stock actualizado.' }, onSettled: refresh, retry: false });
  const hide = useMutation({ mutationFn: hideBeverage, meta: { successMessage: 'Bebida oculta.' }, onSuccess: refresh, retry: false });
  return { query, save, adjust, hide };
}

export function useBeverages(userId) {
  return useQuery({ queryKey: ['beverages', userId], queryFn: getBeverages, enabled: Boolean(userId), retry: false, refetchOnWindowFocus: true, refetchInterval: 30000 });
}

