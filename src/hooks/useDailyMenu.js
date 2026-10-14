import { queryKeys } from './queryKeys';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDailyMenu } from '../services/menuService';
import { getMenuDate } from '../utils/menuDate';

export function useMenuDate() {
  const [date, setDate] = useState(getMenuDate);
  useEffect(() => {
    const refresh = () => setDate(getMenuDate());
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return date;
}

export function useDailyMenu(userId, date) {
  return useQuery({ queryKey: queryKeys.menu(userId, date), queryFn: () => getDailyMenu(date), enabled: Boolean(userId) });
}

