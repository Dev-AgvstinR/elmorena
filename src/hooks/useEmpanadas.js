import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getEmpanadaPrices, saveEmpanadaPrices } from '../services/empanadaService';

export function useEmpanadaPrices(userId) {
  const client = useQueryClient();
  const key = ['empanada-prices', userId];
  const query = useQuery({ queryKey: key, queryFn: getEmpanadaPrices, enabled: Boolean(userId), retry: false, refetchOnWindowFocus: true });
  const save = useMutation({
    mutationFn: saveEmpanadaPrices,
    meta: { successMessage: 'Precios de empanadas guardados.' },
    retry: false,
    onSettled: () => Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: ['sales', userId] }),
    ]),
  });
  return { query, save };
}
