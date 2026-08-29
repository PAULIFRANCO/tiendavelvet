import { supabase } from '../lib/supabase.js';

// Sube imágenes de producto/categoría desde el servidor (con la service_role,
// que siempre puede escribir en Storage), en vez de que el navegador suba
// directo con la clave pública. Evita depender de las políticas de RLS de
// Storage para esta operación puntual de administración.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Solo la administradora (no cualquier usuario logueado) puede subir imágenes.
    // Estar autenticada no alcanza: si alguien se registrara una cuenta propia en
    // Supabase Auth, igual tendría un token "válido" — por eso comparamos también
    // el email contra ADMIN_EMAIL.
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado' });

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    if (!process.env.ADMIN_EMAIL || userData.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { path, base64, contentType } = req.body ?? {};
    if (typeof path !== 'string' || !path || typeof base64 !== 'string' || !base64) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    // Solo permitimos subir imágenes reales — nunca confiamos en el path que
    // manda el navegador tal cual (evita path traversal como "../../algo"),
    // y el content-type se limita a formatos de imagen (evita subir HTML/SVG
    // con scripts embebidos que se sirvan luego como si fueran una foto).
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({ error: 'Formato de imagen no permitido' });
    }
    const safePath = path.replace(/^\/+/, '').replace(/\.\./g, '');
    if (!/^[a-zA-Z0-9/_.-]+$/.test(safePath)) {
      return res.status(400).json({ error: 'Ruta de archivo inválida' });
    }
    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_SIZE_BYTES) {
      return res.status(400).json({ error: 'La imagen no puede pesar más de 5MB' });
    }

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(safePath, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Error al subir imagen a Storage:', uploadError);
      return res.status(500).json({ error: 'No se pudo subir la imagen' });
    }

    const { data: publicData } = supabase.storage.from('product-images').getPublicUrl(safePath);

    return res.status(200).json({ url: publicData.publicUrl });
  } catch (err) {
    console.error('Error al subir imagen:', err);
    return res.status(500).json({ error: 'No se pudo subir la imagen' });
  }
}
