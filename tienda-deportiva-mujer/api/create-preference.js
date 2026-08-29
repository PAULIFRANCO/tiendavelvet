import crypto from 'node:crypto';
import { preferenceClient } from '../lib/mercadopago.js';
import { supabase } from '../lib/supabase.js';

const MAX_QTY_PER_ITEM = 20;
const REQUIRED_SHIPPING_FIELDS = ['fullName', 'phone', 'address', 'city', 'province', 'zip'];

// Envío: tabla fija por zona (mientras no tenemos cuenta de Correo Argentino
// Empresas para cotizar automático — ver ENVIOS-Y-EMAILS-SETUP.md).
// Se calcula server-side: nunca se confía en un costo de envío que venga del cliente.
const FREE_SHIPPING_THRESHOLD = 100000;
const SHIPPING_SANTA_FE = 3000;
const SHIPPING_OTHER = 10000;

function calculateShipping(province, subtotal) {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return /santa\s*fe/i.test(province) ? SHIPPING_SANTA_FE : SHIPPING_OTHER;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { items, payerEmail, shipping } = req.body ?? {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    if (typeof payerEmail !== 'string' || !payerEmail.includes('@')) {
      return res.status(400).json({ error: 'Falta un email válido' });
    }

    if (!shipping || typeof shipping !== 'object') {
      return res.status(400).json({ error: 'Faltan los datos de envío' });
    }
    for (const field of REQUIRED_SHIPPING_FIELDS) {
      if (typeof shipping[field] !== 'string' || !shipping[field].trim()) {
        return res.status(400).json({ error: 'Faltan completar datos de envío' });
      }
    }

    const ids = items.map(i => Number(i?.id)).filter(Number.isFinite);
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, stock')
      .in('id', ids);
    if (productsError) throw productsError;

    // Si algún ítem trae variante (talle/color), buscamos también su stock
    // propio — para esos productos el stock real vive en la variante, no en
    // el producto.
    const variantIds = items.map(i => Number(i?.variantId)).filter(Number.isFinite);
    let variants = [];
    if (variantIds.length > 0) {
      const { data: variantsData, error: variantsError } = await supabase
        .from('product_variants')
        .select('id, product_id, size, color, stock')
        .in('id', variantIds);
      if (variantsError) throw variantsError;
      variants = variantsData;
    }

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

      let variant = null;
      if (rawItem?.variantId != null) {
        variant = variants.find(v => v.id === Number(rawItem.variantId) && v.product_id === product.id);
        // Si mandaron un variantId pero no corresponde a este producto (o no
        // existe), tratamos el pedido como inválido en vez de ignorarlo en
        // silencio — evita comprar "a ciegas" una combinación inexistente.
        if (!variant) {
          return res.status(400).json({ error: `Elegí un talle/color válido para "${product.name}"` });
        }
      }

      const availableStock = variant ? variant.stock : product.stock;
      if (qty > availableStock) {
        return res.status(409).json({ error: `Sin stock suficiente de "${product.name}"` });
      }

      const variantLabel = variant
        ? [variant.size, variant.color].filter(Boolean).join(' / ')
        : '';

      orderItems.push({
        id: String(product.id),
        title: variantLabel ? `${product.name} (${variantLabel})` : product.name,
        quantity: qty,
        unit_price: product.price,
        currency_id: 'ARS',
        ...(variant ? { variantId: variant.id } : {}),
      });
      total += product.price * qty;
    }

    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) throw new Error('Falta la variable de entorno SITE_URL');

    const orderId = crypto.randomUUID();
    const cleanShipping = {
      fullName: shipping.fullName.trim(),
      phone: shipping.phone.trim(),
      address: shipping.address.trim(),
      city: shipping.city.trim(),
      province: shipping.province.trim(),
      zip: shipping.zip.trim(),
    };

    const shippingCost = calculateShipping(cleanShipping.province, total);
    if (shippingCost > 0) {
      orderItems.push({
        id: 'shipping',
        title: 'Envío',
        quantity: 1,
        unit_price: shippingCost,
        currency_id: 'ARS',
      });
      total += shippingCost;
    }

    const { error: dbError } = await supabase.from('orders').insert({
      id: orderId,
      items: orderItems,
      total,
      status: 'pending',
      fulfillment_status: 'no_preparado',
      payer_email: payerEmail,
      shipping: cleanShipping,
    });
    if (dbError) throw dbError;

    const [firstName, ...rest] = cleanShipping.fullName.split(' ');

    const preference = await preferenceClient.create({
      body: {
        items: orderItems,
        external_reference: orderId,
        payer: {
          email: payerEmail,
          name: firstName,
          surname: rest.join(' ') || firstName,
          phone: { number: cleanShipping.phone },
        },
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
