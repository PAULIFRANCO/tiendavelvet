// Sirve la URL y la clave pública (anon/publishable) de Supabase al navegador.
// Esta clave está diseñada para ser pública: el acceso real lo controlan las
// políticas de RLS en Supabase, no el secreto de esta clave. Por eso es segura
// de exponer acá (a diferencia de SUPABASE_SERVICE_ROLE_KEY, que nunca sale del backend).
export default function handler(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Falta configuración de Supabase' });
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
}
