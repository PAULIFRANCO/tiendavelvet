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
    // Solo una administradora logueada puede subir imágenes.
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado' });

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { path, base64, contentType } = req.body ?? {};
    if (typeof path !== 'string' || !path || typeof base64 !== 'string' || !base64) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const buffer = Buffer.from(base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(path, buffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error('Error al subir imagen a Storage:', uploadError);
      return res.status(500).json({ error: 'No se pudo subir la imagen' });
    }

    const { data: publicData } = supabase.storage.from('product-images').getPublicUrl(path);

    return res.status(200).json({ url: publicData.publicUrl });
  } catch (err) {
    console.error('Error al subir imagen:', err);
    return res.status(500).json({ error: 'No se pudo subir la imagen' });
  }
}
