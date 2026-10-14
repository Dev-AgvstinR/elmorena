import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adjustBeverageStock, getBeverages, hideBeverage, saveBeverage } from '../services/stockService';

export function useStock(userId) {
  const client = useQueryClient();
  const key = ['beverages', userId];
  const query = useQuery({ queryKey: key, queryFn: getBeverages, enabled: Boolean(userId), retry: false, refetchOnWindowFocus: true });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const save = useMutation({ mutationFn: saveBeverage, onSuccess: refresh, retry: false });
  const adjust = useMutation({ mutationFn: adjustBeverageStock, onSettled: refresh, retry: false });
  const hide = useMutation({ mutationFn: hideBeverage, onSuccess: refresh, retry: false });
  return { query, save, adjust, hide };
}

export function useBeverages(userId) {
  return useQuery({ queryKey: ['beverages', userId], queryFn: getBeverages, enabled: Boolean(userId), retry: false, refetchOnWindowFocus: true });
}
