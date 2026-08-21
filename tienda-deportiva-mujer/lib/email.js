// Envío de emails transaccionales vía Resend (https://resend.com).
// Requiere RESEND_API_KEY y EMAIL_FROM en las variables de entorno.
export async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.warn('Email no enviado: falta RESEND_API_KEY o EMAIL_FROM');
    return { skipped: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Error al enviar email:', res.status, body);
    return { error: true };
  }

  return { ok: true };
}

const emailShell = (title, bodyHtml) => `
  <div style="font-family: 'Poppins', Arial, sans-serif; background: #f6f3ee; padding: 32px 16px;">
    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 4px; overflow: hidden;">
      <div style="background: #16141c; padding: 28px; text-align: center;">
        <span style="font-size: 22px; font-weight: 800; color: #ffffff;">velvet<span style="color:#c98a9a;">.</span></span>
      </div>
      <div style="padding: 32px 28px; color: #16141c;">
        <h1 style="font-size: 20px; margin: 0 0 16px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding: 20px 28px; text-align: center; color: #8a8590; font-size: 12px;">
        VELVET — Ropa deportiva de mujer
      </div>
    </div>
  </div>
`;

export function orderApprovedEmail(order) {
  const itemsHtml = (order.items || [])
    .map(i => `<li>${i.quantity} x ${i.title}</li>`)
    .join('');
  return emailShell(
    '¡Tu pago fue aprobado!',
    `<p style="line-height:1.6;">Gracias por tu compra. Ya estamos preparando tu pedido:</p>
     <ul style="line-height:1.8;">${itemsHtml}</ul>
     <p style="font-weight:700;">Total: $${Number(order.total).toLocaleString('es-AR')}</p>
     <p style="line-height:1.6; color:#56505d;">Te vamos a avisar por acá mismo cuando esté preparado y cuando salga a envío.</p>`
  );
}

export function orderStatusEmail(order, statusLabel, extraText = '') {
  return emailShell(
    `Tu pedido está ${statusLabel}`,
    `<p style="line-height:1.6;">¡Novedades sobre tu compra en VELVET! Tu pedido ahora está <strong>${statusLabel}</strong>.</p>
     ${extraText ? `<p style="line-height:1.6;">${extraText}</p>` : ''}
     <p style="font-weight:700;">Total: $${Number(order.total).toLocaleString('es-AR')}</p>`
  );
}
