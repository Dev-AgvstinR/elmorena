import { useQuery } from '@tanstack/react-query';
import { getSales } from '../services/salesService';
import { queryKeys } from './queryKeys';

export function useSales(userId, date) {
  return useQuery({
    queryKey: queryKeys.salesDay(userId, date), queryFn: () => getSales(date), enabled: Boolean(userId),
    refetchOnWindowFocus: true,
    retry: (attempt, error) => {
      // Un esquema incompleto o una consulta inválida necesitan una corrección, no reintentos.
      if (error.code?.startsWith('42') || error.code?.startsWith('PGRST')) return false;
      return attempt < 1;
    },
  });
}
