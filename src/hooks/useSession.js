import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSession, onSessionChange } from '../services/authService';

export function useSession() {
  const client = useQueryClient();
  const [state, setState] = useState({ session: null, loading: true, error: null });
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    let previousUser;
    const accept = (session) => {
      if (!active) return;
      const userId = session?.user.id ?? null;
      if (previousUser !== undefined && previousUser !== userId) client.clear();
      previousUser = userId;
      setState({ session, loading: false, error: null });
    };
    const unsubscribe = onSessionChange((session) => {
      receivedEvent = true;
      accept(session);
    });
    getSession().then((session) => {
      if (!receivedEvent) accept(session);
    }).catch((error) => {
      if (active && !receivedEvent) setState({ session: null, loading: false, error });
    });
    return () => { active = false; unsubscribe(); };
  }, [client]);
  return state;
}
