import { queryKeys } from './queryKeys';
import { useQuery } from '@tanstack/react-query';
import { getDishes } from '../services/dishService';

export function useDishes(userId) {
  return useQuery({ queryKey: queryKeys.dishes(userId), queryFn: getDishes, enabled: Boolean(userId) });
}

