import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

if (!process.env.MP_ACCESS_TOKEN) {
  throw new Error('Falta la variable de entorno MP_ACCESS_TOKEN');
}

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

export const preferenceClient = new Preference(client);
export const paymentClient = new Payment(client);
