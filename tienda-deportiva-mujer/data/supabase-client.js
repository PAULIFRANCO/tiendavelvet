// Cliente de Supabase para el navegador (sitio público y panel de admin).
// Usa la clave pública (anon), obtenida en runtime desde /api/public-config
// para no tener que hardcodear nada en el código fuente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let clientPromise = null;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = fetch('/api/public-config')
      .then(res => res.json())
      .then(({ supabaseUrl, supabaseAnonKey }) => createClient(supabaseUrl, supabaseAnonKey));
  }
  return clientPromise;
}
