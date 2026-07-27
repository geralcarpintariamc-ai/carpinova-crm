import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Cria um ficheiro .env " +
    "(vê .env.example) ou define os secrets no GitHub Actions."
  );
}

export const supabase = createClient(url || "", anonKey || "");
