# VELVET — Backend de pagos

Arquitectura: **Vercel** (hosting + funciones serverless) + **Mercado Pago Checkout Pro** (pago) + **Supabase** (pedidos).

Cómo funciona el flujo:
1. La clienta arma su carrito (queda guardado en su navegador).
2. Al hacer clic en "Finalizar compra", el navegador le pide al backend (`/api/create-preference`) que cree el pago — pero solo le manda **qué productos y cuántos**, nunca el precio.
3. El backend busca el precio real en su propio catálogo (`data/products.js`), arma el pedido en Supabase como `pending`, y le pide a Mercado Pago un link de pago.
4. La clienta paga en Mercado Pago (nunca en tu sitio — ahí es donde tipea los datos de la tarjeta, con el servidor PCI-compliant de MP, no el tuyo).
5. Mercado Pago le avisa a tu backend por webhook (`/api/webhook`) si el pago se aprobó, y ahí se actualiza el pedido en Supabase.

---

## Paso 1 — Cuenta de Mercado Pago

1. Entrá a https://www.mercadopago.com.ar/developers/panel y creá tu cuenta de desarrollador (si ya tenés cuenta de MP, usás la misma).
2. Creá una aplicación ("Tus integraciones" → "Crear aplicación").
3. Copiá el **Access Token de prueba (TEST-...)** — lo vas a usar primero para probar todo el flujo sin plata real.
4. En la misma sección, andá a **Webhooks** y creá uno apuntando a:
   `https://TU-DOMINIO.vercel.app/api/webhook`
   Elegí el evento **"Pagos"**. MP te va a dar una **clave secreta** — la necesitás para `MP_WEBHOOK_SECRET`.

## Paso 2 — Base de datos en Supabase

1. Creá una cuenta gratis en https://supabase.com y un proyecto nuevo.
2. Andá a **SQL Editor** y ejecutá:

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  items jsonb not null,
  total numeric not null,
  status text not null default 'pending',
  mp_payment_id text,
  payer_email text
);

alter table orders enable row level security;
-- A propósito no se crean policies: nadie puede leer/escribir desde el
-- navegador. Solo el backend, usando la service_role key, puede acceder.
```

3. Andá a **Settings → API** y copiá:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key (⚠️ no la `anon` key) → `SUPABASE_SERVICE_ROLE_KEY`

## Paso 3 — Desplegar en Vercel

1. Con el repo ya en GitHub, entrá a https://vercel.com, "Add New… → Project" e importá el repo.
2. Antes del primer deploy, andá a **Settings → Environment Variables** y cargá:

| Variable | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | El TEST-... de Mercado Pago (después lo cambiás por el de producción) |
| `MP_WEBHOOK_SECRET` | La clave secreta del webhook |
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | La service role key |
| `SITE_URL` | La URL pública que te da Vercel, ej. `https://velvet.vercel.app` (sin barra al final) |

3. Deploy. Vercel detecta automáticamente `index.html` como sitio estático y los archivos en `/api` como funciones serverless.
4. Si cambiaste `SITE_URL` después del primer deploy (por ejemplo al conectar un dominio propio), actualizá la variable y volvé a desplegar.

## Paso 4 — Probar el flujo completo (modo test)

Con el `MP_ACCESS_TOKEN` de TEST puesto:
1. Entrá al sitio, agregá productos al carrito, hacé clic en "Finalizar compra".
2. Te va a redirigir a un checkout de Mercado Pago en modo sandbox.
3. Pagá con una [tarjeta de prueba de Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards) (son públicas, están en su documentación).
4. Verificá en la tabla `orders` de Supabase que el pedido pasó de `pending` a `approved`.

## Paso 5 — Pasar a producción

1. En el panel de Mercado Pago, copiá el **Access Token de producción**.
2. Reemplazá `MP_ACCESS_TOKEN` en Vercel por ese valor y volvé a desplegar.
3. Listo — a partir de ahí los pagos son reales.

---

## Checklist de seguridad (qué ya está resuelto y qué falta)

**Ya implementado:**
- El precio de cada producto lo calcula el backend desde su propio catálogo — el navegador nunca puede mandar un precio distinto.
- Los datos de tarjeta nunca pasan por tu servidor (Checkout Pro redirige a Mercado Pago).
- El webhook verifica la firma HMAC de Mercado Pago antes de confiar en cualquier notificación de pago.
- Las claves secretas (`MP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) solo existen en el backend, nunca en el código que llega al navegador.
- Supabase tiene Row Level Security activado sin políticas públicas: solo el backend puede leer/escribir pedidos.
- HTTPS automático (Vercel) + cabeceras de seguridad (`vercel.json`: HSTS, X-Frame-Options, nosniff, etc.).

**Recomendado para más adelante (no bloqueante para arrancar):**
- Rate limiting en `/api/create-preference` para evitar abuso (ej. con Upstash Ratelimit).
- Envío de email de confirmación real al aprobarse un pago (hoy solo se actualiza la base de datos).
- Panel de administración para ver/gestionar pedidos (hoy hay que mirarlos en Supabase directamente).
- Si más adelante agregás login de usuarias, usar cookies `httpOnly` + `secure` y nunca guardar contraseñas en texto plano (Supabase Auth ya resuelve esto si lo usás).

## Desarrollo local

```bash
npm install
npx vercel dev
```

Esto levanta el sitio y las funciones de `/api` en `http://localhost:3000`, usando las variables de un archivo `.env` local (copiá `.env.example` a `.env` y completalo con tus credenciales de TEST). `.env` está en `.gitignore`, así que nunca se sube a GitHub.
