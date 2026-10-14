import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Configurá VITE_SUPABASE_URL y la clave pública de Supabase en .env.local.",
  );
}
if (key.startsWith("sb_secret_")) {
  throw new Error("Usá una clave publishable o anon. Nunca una clave secreta.");
}
// Las claves JWT antiguas también deben ser públicas (rol anon).
if (key.split(".").length === 3) {
  try {
    const payload = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    if (JSON.parse(atob(payload)).role !== "anon") {
      throw new Error(
        "La clave del cliente debe tener rol anon. Nunca service_role.",
      );
    }
  } catch {
    throw new Error(
      "Clave pública inválida: usá publishable o anon, nunca service_role.",
    );
  }
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
