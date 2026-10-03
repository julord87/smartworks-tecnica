import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { appUrl, cronAuthorized, cronClient } from "@/lib/cron";
import { emailConfigured, sendBatch } from "@/lib/email/send";
import { renderNotification, type QueuedMail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

const CHUNK = 100;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // Sin Resend configurado no se reserva nada: la cola sigue pendiente hasta que se configure (caduca a los 2 dias)
  if (!emailConfigured()) return NextResponse.json({ skipped: "Resend sin configurar" });

  const secret = process.env.CRON_SECRET!;
  const supabase = cronClient();
  const { data, error } = await supabase.rpc("notifications_claim", { p_secret: secret });
  if (error) {
    console.error("notifications_claim", error);
    return NextResponse.json({ error: "No se pudo leer la cola" }, { status: 500 });
  }

  const queued = (data ?? []) as QueuedMail[];
  const base = appUrl();
  let sent = 0;
  const failures: string[] = [];

  for (let i = 0; i < queued.length; i += CHUNK) {
    const chunk = queued.slice(i, i + CHUNK);
    const ids = chunk.flatMap((m) => m.ids);
    const key = createHash("sha256").update(ids.join(",")).digest("hex");
    const err = await sendBatch(
      chunk.map((m) => renderNotification(m, base)),
      key,
    );
    await supabase.rpc("notifications_ack", { p_secret: secret, p_ids: ids, p_error: err });
    if (err) failures.push(err);
    else sent += chunk.length;
  }

  if (failures.length) console.error("notificaciones", failures);
  return NextResponse.json({ sent, failed: failures.length });
}
