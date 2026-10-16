import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDailyExpense, deleteDailyExpense, getDailyExpenses } from '../services/expenseService';

const expenseKey = (userId, date) => ['expenses', userId, date];

export function useDailyExpenses(userId, date) {
  return useQuery({
    queryKey: expenseKey(userId, date), queryFn: () => getDailyExpenses(date),
    enabled: Boolean(userId && date), refetchInterval: 15000, staleTime: 10000, retry: false,
  });
}

export function useExpenseMutations(userId, date) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: expenseKey(userId, date) });
  const add = useMutation({ mutationFn: addDailyExpense, onSuccess: refresh,
    meta: { successMessage: 'Gasto registrado.' }, retry: false });
  const remove = useMutation({ mutationFn: deleteDailyExpense, onSuccess: refresh,
    meta: { successMessage: 'Gasto eliminado.' }, retry: false });
  return { add, remove };
}
