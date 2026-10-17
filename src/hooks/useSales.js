import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getFiadosPage, getSalesPage, getSalesSummary } from '../services/salesService';
import { queryKeys } from './queryKeys';

export function useSales(userId, date, state, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.salesDay(userId, date), state],
    queryFn: ({ pageParam }) => getSalesPage(date, state, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: Boolean(userId) && enabled, refetchInterval: 15000, staleTime: 10000,
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

export function useFiados(userId, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.fiados(userId),
    queryFn: ({ pageParam }) => getFiadosPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: Boolean(userId) && enabled,
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
  });
}
