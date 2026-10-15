import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getSalesPage, getSalesSummary } from '../services/salesService';
import { queryKeys } from './queryKeys';

export function useSales(userId, date, state) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.salesDay(userId, date), state],
    queryFn: ({ pageParam }) => getSalesPage(date, state, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: Boolean(userId), refetchInterval: 15000, staleTime: 10000,
    retry: false,
  });
}

export function useSalesSummary(userId, date) {
  return useQuery({
    queryKey: [...queryKeys.salesDay(userId, date), 'summary'],
    queryFn: () => getSalesSummary(date), enabled: Boolean(userId),
    refetchInterval: 15000, staleTime: 10000, retry: false,
  });
}
