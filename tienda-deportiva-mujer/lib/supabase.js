import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Faltan las variables de entorno de Supabase');
}

// La service role key solo se usa acá (backend). Nunca debe llegar al frontend:
// evita las políticas RLS, así que si se filtrara, cualquiera podría leer/escribir pedidos.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
