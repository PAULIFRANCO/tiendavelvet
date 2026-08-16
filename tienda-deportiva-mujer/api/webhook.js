import crypto from 'node:crypto';
import { paymentClient } from '../lib/mercadopago.js';
import { supabase } from '../lib/supabase.js';

// Verifica la firma HMAC que envía Mercado Pago según su documentación oficial,
// para asegurarnos de que la notificación viene realmente de MP y no de un tercero
// simulando un pago aprobado.
function isValidSignature(req, dataId) {
  try {
    const signatureHeader = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];

    if (!signatureHeader || !requestId || !dataId || !process.env.MP_WEBHOOK_SECRET) {
      return false;
    }

    const parts = Object.fromEntries(
      String(signatureHeader)
        .split(',')
        .map(part => part.trim().split('='))
    );
    const { ts, v1 } = parts;
    if (!ts || !v1) return false;

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = crypto
      .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(manifest)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(v1, 'hex');

    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const dataId = req.query?.['data.id'] || req.body?.data?.id;

  if (!isValidSignature(req, dataId)) {
    console.warn('Webhook rechazado: firma inválida');
    return res.status(401).end();
  }

  try {
    if (!dataId) return res.status(200).end();

    const payment = await paymentClient.get({ id: dataId });
    const orderId = payment.external_reference;

    if (orderId) {
      await supabase
        .from('orders')
        .update({
          status: payment.status,
          mp_payment_id: String(payment.id),
        })
        .eq('id', orderId);
    }

    return res.status(200).end();
  } catch (err) {
    console.error('Error procesando webhook de Mercado Pago:', err);
    // Igual respondemos 200: si devolvemos error, MP reintenta indefinidamente.
    return res.status(200).end();
  }
}
