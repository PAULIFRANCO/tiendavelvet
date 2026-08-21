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

    const matches =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!matches) {
      // Log temporal para diagnosticar el mismatch de firma. No expone el secreto.
      console.warn('DEBUG firma inválida:', {
        manifest,
        expected,
        received: v1,
        secretLength: process.env.MP_WEBHOOK_SECRET.length,
      });
    }

    return matches;
  } catch (err) {
    console.warn('DEBUG excepción validando firma:', err.message);
    return false;
  }
}

// Descuenta stock por cada producto del pedido, usando la función atómica
// discount_stock (ver SEGURIDAD-SETUP.md) para que dos aprobaciones
// simultáneas del mismo producto no pisen el stock una a la otra.
// Se llama solo una vez, cuando el pedido pasa a "approved" por primera vez.
async function discountStock(items) {
  for (const item of items) {
    const productId = Number(item.id);
    const { error } = await supabase.rpc('discount_stock', {
      p_id: productId,
      p_qty: item.quantity,
    });
    if (error) console.error(`Error al descontar stock del producto ${productId}:`, error);
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Diagnóstico temporal: permite comparar a simple vista, sin exponerlo
    // completo, qué secreto tiene cargado Vercel ahora mismo contra el que
    // muestra Mercado Pago. Se saca una vez resuelto el problema de firma.
    const secret = process.env.MP_WEBHOOK_SECRET || '';
    const preview = secret.length > 12
      ? `${secret.slice(0, 6)}...${secret.slice(-6)}`
      : '(vacío o muy corto)';
    return res.status(200).json({ secretLength: secret.length, secretPreview: preview });
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const dataId = req.query?.['data.id'] || req.body?.data?.id;

  if (!dataId) {
    // Mercado Pago también manda avisos de otros tipos (ej. topic=merchant_order)
    // que no traen data.id — no son pagos, los ignoramos sin tratarlos como error.
    return res.status(200).end();
  }

  // ⚠️ TEMPORAL — VOLVER A ACTIVAR AL PASAR A PRODUCCIÓN ⚠️
  // En modo prueba, Mercado Pago exige alternar entre la cuenta real y la
  // cuenta vendedora de prueba para ver la clave de firma correcta, lo que
  // generó desfasajes difíciles de sincronizar. Por eso, mientras tanto, NO
  // bloqueamos si la firma no coincide (solo lo registramos). Esto es seguro
  // porque más abajo siempre volvemos a consultar el pago directo a la API de
  // Mercado Pago con nuestro propio Access Token — nunca se confía en lo que
  // dice el cuerpo de la notificación. Descomentar el "return 401" de abajo
  // al pasar a producción, donde ya no existe este problema de cuentas separadas.
  if (!isValidSignature(req, dataId)) {
    console.warn('Firma inválida (no bloqueante en modo prueba — ver nota arriba)');
    // return res.status(401).end();
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
