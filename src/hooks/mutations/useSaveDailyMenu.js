import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveDailyMenu } from '../../services/menuService';
import { queryKeys } from '../queryKeys';

export function useSaveDailyMenu(userId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveDailyMenu, retry: false,
    onSuccess: (rows, variables) => {
      client.setQueryData(queryKeys.menu(userId, variables.date), rows);
      return client.invalidateQueries({ queryKey: queryKeys.menu(userId, variables.date) });
    },
  });
}
