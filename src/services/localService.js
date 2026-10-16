import { supabase } from './supabaseClient';
import { getSession } from './authService';
import { explainSchemaError } from '../utils/schemaError';

let cachedUserId;
let localRequest;

// user_id se mantiene como clave del local por compatibilidad con el esquema.
// La cuenta que inició sesión sigue siendo la identidad de autenticación.
export async function requireLocal() {
  const session = await getSession();
  if (!session) {
    cachedUserId = undefined;
    localRequest = undefined;
    throw new Error('Iniciá sesión para continuar.');
  }
  if (cachedUserId !== session.user.id) {
    cachedUserId = session.user.id;
    localRequest = undefined;
  }
  if (!localRequest) {
    const request = supabase.rpc('local_owner_id').then(({ data, error }) => {
      if (error) throw explainSchemaError(error, 'local_owner_id');
      if (!data) throw new Error('El local compartido todavía no está configurado.');
      return { id: data };
    });
    localRequest = request;
    request.catch(() => { if (localRequest === request) localRequest = undefined; });
  }
  return localRequest;
}
