import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { closeDay, getDayClosure, getHistory } from '../services/historyService';
import { queryKeys } from './queryKeys';

export function useDayClosure(userId, date) {
  return useQuery({ queryKey: ['day-closure', userId, date], queryFn: () => getDayClosure(date), enabled: Boolean(userId), refetchOnWindowFocus: true, retry: false });
}
export function useHistory(userId) {
  return useQuery({ queryKey: ['history', userId], queryFn: getHistory, enabled: Boolean(userId), retry: false });
}
export function useCloseDay(userId) {
  const client = useQueryClient();
  return useMutation({ mutationFn: closeDay, retry: false,
    onSuccess: (row, date) => {
      client.setQueryData(['day-closure', userId, date], row);
      return Promise.all([
        client.invalidateQueries({ queryKey: ['history', userId] }),
        client.invalidateQueries({ queryKey: queryKeys.sales(userId) }),
        client.invalidateQueries({ queryKey: queryKeys.menus(userId) }),
      ]);
    },
  });
}
