import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { closeDay, getDayClosure, getHistory, getHistoryDay } from '../services/historyService';
import { queryKeys } from './queryKeys';

export function useDayClosure(userId, date) {
  return useQuery({ queryKey: ['day-closure', userId, date], queryFn: () => getDayClosure(date), enabled: Boolean(userId), refetchInterval: (query) => query.state.data ? false : 15000, refetchOnWindowFocus: true, retry: false });
}
export function useHistory(userId) {
  return useInfiniteQuery({ queryKey: ['history', userId], queryFn: ({ pageParam }) => getHistory(pageParam), initialPageParam: null, getNextPageParam: (page) => page.nextDate, enabled: Boolean(userId), retry: false });
}
export function useHistoryDay(userId, id) {
  return useQuery({ queryKey: ['history-day', userId, id], queryFn: () => getHistoryDay(id), enabled: Boolean(userId && id), staleTime: Infinity, retry: false });
}
export function useCloseDay(userId) {
  const client = useQueryClient();
  return useMutation({ mutationFn: closeDay, retry: false, meta: { successMessage: 'Día terminado. El resumen quedó guardado.' },
    onSuccess: (row, date) => {
      client.setQueryData(['day-closure', userId, date], row);
      client.setQueryData(['history-day', userId, row.id], row);
      return Promise.all([
        client.invalidateQueries({ queryKey: ['history', userId] }),
        client.invalidateQueries({ queryKey: queryKeys.sales(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.menus(userId) }),
      ]);
    },
  });
}
