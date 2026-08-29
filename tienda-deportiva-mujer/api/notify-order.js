import { supabase } from '../lib/supabase.js';
import { sendEmail, orderStatusEmail } from '../lib/email.js';

const STATUS_LABELS = {
  preparando: 'en preparación',
  enviado: 'enviado',
  entregado: 'entregado',
};
const VALID_STATUSES = ['no_preparado', ...Object.keys(STATUS_LABELS)];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Solo la administradora (no cualquier usuario logueado) puede cambiar el
    // estado de un pedido. Estar autenticada no alcanza: si alguien se registrara
    // una cuenta propia en Supabase Auth, igual tendría un token "válido" —
    // por eso comparamos también el email contra ADMIN_EMAIL.
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

    const { orderId, fulfillmentStatus } = req.body ?? {};
    if (!orderId || !VALID_STATUSES.includes(fulfillmentStatus)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .update({ fulfillment_status: fulfillmentStatus })
      .eq('id', orderId)
      .select('*')
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const label = STATUS_LABELS[fulfillmentStatus];
    if (label && order.payer_email) {
      await sendEmail({
        to: order.payer_email,
        subject: `Tu pedido está ${label} — VELVET`,
        html: orderStatusEmail(order, label),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error al notificar pedido:', err);
    return res.status(500).json({ error: 'No se pudo actualizar el pedido' });
  }
}
