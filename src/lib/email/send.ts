import type { RenderedMail } from "./templates";

const RESEND_URL = process.env.RESEND_API_URL ?? "https://api.resend.com";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

// Envio en lote (hasta 100 por llamada). Devuelve un error por lote, o null si salio bien.
export async function sendBatch(mails: RenderedMail[], idempotencyKey: string): Promise<string | null> {
  const res = await fetch(`${RESEND_URL}/emails/batch`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(
      mails.map((m) => ({ from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text })),
    ),
  });
  if (res.ok) return null;
  return `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
}
