import crypto from 'node:crypto';
import { preferenceClient } from '../lib/mercadopago.js';
import { supabase } from '../lib/supabase.js';

const MAX_QTY_PER_ITEM = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { items, payerEmail } = req.body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    const ids = items.map(i => Number(i?.id)).filter(Number.isFinite);
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, stock')
      .in('id', ids);
    if (productsError) throw productsError;

    // Precio y stock SIEMPRE verificados server-side contra la base de datos.
    // Nunca se confía en un precio que venga del cliente.
    const orderItems = [];
    let total = 0;

    for (const rawItem of items) {
      const product = products.find(p => p.id === Number(rawItem?.id));
      const qty = Number(rawItem?.qty);

      if (!product || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY_PER_ITEM) {
        return res.status(400).json({ error: 'Carrito inválido' });
      }
      if (qty > product.stock) {
        return res.status(409).json({ error: `Sin stock suficiente de "${product.name}"` });
      }

      orderItems.push({
        id: String(product.id),
        title: product.name,
        quantity: qty,
        unit_price: product.price,
        currency_id: 'ARS',
      });
      total += product.price * qty;
    }

    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) throw new Error('Falta la variable de entorno SITE_URL');

    const orderId = crypto.randomUUID();

    const { error: dbError } = await supabase.from('orders').insert({
      id: orderId,
      items: orderItems,
      total,
      status: 'pending',
      payer_email: typeof payerEmail === 'string' ? payerEmail : null,
    });
    if (dbError) throw dbError;

    const preference = await preferenceClient.create({
      body: {
        items: orderItems,
        external_reference: orderId,
        payer: typeof payerEmail === 'string' ? { email: payerEmail } : undefined,
        back_urls: {
          success: `${siteUrl}/success.html`,
          failure: `${siteUrl}/failure.html`,
          pending: `${siteUrl}/pending.html`,
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/api/webhook`,
      },
    });

    return res.status(200).json({
      init_point: preference.init_point,
      orderId,
    });
  } catch (err) {
    // No exponemos el error interno al cliente (podría filtrar detalles de infraestructura).
    console.error('Error al crear preferencia de pago:', err);
    return res.status(500).json({ error: 'No se pudo iniciar el pago. Intentá de nuevo.' });
  }
}
