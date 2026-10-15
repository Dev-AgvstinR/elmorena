import { supabase } from "./supabaseClient";

export async function signUp({ email, password }) {
  if (password.length < 8) throw new Error('Usá una contraseña de al menos 8 caracteres.');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Para restaurar la pantalla; la autorización real siempre depende de RLS.
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onSessionChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) =>
    callback(session, event),
  );
  return () => data.subscription.unsubscribe();
}

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Iniciá sesión para continuar.");
  return data.user;
}
