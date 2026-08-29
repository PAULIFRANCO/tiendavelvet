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

    return (
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  } catch {
    return false;
  }
}

// Descuenta stock por cada producto del pedido, usando funciones atómicas
// (discount_stock / discount_variant_stock, ver SEGURIDAD-SETUP.md y
// VARIANTES-SETUP.md) para que dos aprobaciones simultáneas del mismo
// producto o variante no se pisen entre sí.
// Se llama solo una vez, cuando el pedido pasa a "approved" por primera vez.
async function discountStock(items) {
  for (const item of items) {
    if (item.id === 'shipping') continue; // no es un producto, es el costo de envío

    // Si el ítem tiene talle/color elegido, el stock real vive en la
    // variante — descontamos ahí en vez de en el producto.
    if (item.variantId != null) {
      const { error } = await supabase.rpc('discount_variant_stock', {
        p_variant_id: Number(item.variantId),
        p_qty: item.quantity,
      });
      if (error) console.error(`Error al descontar stock de la variante ${item.variantId}:`, error);
      continue;
    }

    const productId = Number(item.id);
    const { error } = await supabase.rpc('discount_stock', {
      p_id: productId,
      p_qty: item.quantity,
    });
    if (error) console.error(`Error al descontar stock del producto ${productId}:`, error);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const dataId = req.query?.['data.id'] || req.body?.data?.id;

  if (!dataId) {
    // Mercado Pago también manda avisos de otros tipos (ej. topic=merchant_order)
    // que no traen data.id — no son pagos, los ignoramos sin tratarlos como error.
    return res.status(200).end();
  }

  // Verificación de firma reactivada: ya en producción no existe el lío de
  // cuenta real / cuenta de prueba que teníamos en modo test.
  if (!isValidSignature(req, dataId)) {
    console.warn('Webhook rechazado: firma inválida');
    return res.status(401).end();
  }

  try {
    const payment = await paymentClient.get({ id: dataId });
    const orderId = payment.external_reference;

    if (orderId) {
      if (payment.status === 'approved') {
        // UPDATE atómico con guarda WHERE status != 'approved': si dos
        // notificaciones del mismo pago llegan casi al mismo tiempo (reintento
        // de MP), solo una de ellas "gana" la fila y dispara los efectos
        // (descuento de stock + email). La otra no encuentra fila para
        // actualizar y no hace nada más.
        const { data: order } = await supabase
          .from('orders')
          .update({ status: payment.status, mp_payment_id: String(payment.id) })
          .eq('id', orderId)
          .neq('status', 'approved')
          .select('items, total, payer_email')
          .maybeSingle();

        if (order?.items) {
          await discountStock(order.items);

          if (order.payer_email) {
            await sendEmail({
              to: order.payer_email,
              subject: '¡Tu pago fue aprobado! — VELVET',
              html: orderApprovedEmail(order),
            });
          }
        }
      } else {
        await supabase
          .from('orders')
          .update({ status: payment.status, mp_payment_id: String(payment.id) })
          .eq('id', orderId);
      }
    }

    return res.status(200).end();
  } catch (err) {
    console.error('Error procesando webhook de Mercado Pago:', err);
    // Igual respondemos 200: si devolvemos error, MP reintenta indefinidamente.
    return res.status(200).end();
  }
}
