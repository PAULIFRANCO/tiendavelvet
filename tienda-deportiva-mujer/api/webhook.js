import crypto from 'node:crypto';
import { paymentClient } from '../lib/mercadopago.js';
import { supabase } from '../lib/supabase.js';
import { sendEmail, orderApprovedEmail } from '../lib/email.js';

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

// Descuenta stock por cada producto del pedido. Se llama solo una vez,
// cuando el pedido pasa a "approved" por primera vez (ver más abajo).
async function discountStock(items) {
  for (const item of items) {
    const productId = Number(item.id);
    const { data: product, error } = await supabase
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single();
    if (error || !product) continue;

    const newStock = Math.max(0, product.stock - item.quantity);
    await supabase.from('products').update({ stock: newStock }).eq('id', productId);
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
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('status, items, total, payer_email')
        .eq('id', orderId)
        .single();

      await supabase
        .from('orders')
        .update({
          status: payment.status,
          mp_payment_id: String(payment.id),
        })
        .eq('id', orderId);

      const wasAlreadyApproved = existingOrder?.status === 'approved';
      if (payment.status === 'approved' && !wasAlreadyApproved && existingOrder?.items) {
        await discountStock(existingOrder.items);

        if (existingOrder.payer_email) {
          await sendEmail({
            to: existingOrder.payer_email,
            subject: '¡Tu pago fue aprobado! — VELVET',
            html: orderApprovedEmail(existingOrder),
          });
        }
      }
    }

    return res.status(200).end();
  } catch (err) {
    console.error('Error procesando webhook de Mercado Pago:', err);
    // Igual respondemos 200: si devolvemos error, MP reintenta indefinidamente.
    return res.status(200).end();
  }
}
