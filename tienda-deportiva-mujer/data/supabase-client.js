// Cliente de Supabase para el navegador (sitio público y panel de admin).
// La URL y la clave "anon/publishable" están pensadas para ser públicas:
// el acceso real lo controlan las políticas de RLS en Supabase, no el
// secreto de estos valores (a diferencia de la service_role key, que
// nunca sale del backend). Por eso van directo acá, sin pedirlas al servidor
// en cada carga — así la tienda abre más rápido.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://uuwkshrbttyluiwvyjxs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9jy_kuLeEK9CWlM64Fjehg_x4zjq-Mt';

let client = null;

export function getSupabase() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return Promise.resolve(client);
}
