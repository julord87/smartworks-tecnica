import { NextResponse } from "next/server";
import { appUrl, cronAuthorized, cronClient } from "@/lib/cron";
import { emailConfigured, sendBatch } from "@/lib/email/send";
import { renderDigest, type Digest } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

// Hora y dia en Madrid (pg_cron corre en UTC y llama a las 6 y 7 UTC: solo una es las 8 en Madrid)
function madridNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    hour: Number(get("hour")),
    weekday: get("weekday"),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ skipped: "Resend sin configurar" });

  const force = new URL(request.url).searchParams.get("forzar") === "1";
  const now = madridNow();
  if (!force && (now.hour !== 8 || now.weekday === "Sat" || now.weekday === "Sun")) {
    return NextResponse.json({ skipped: "fuera de horario", madrid: now });
  }

  const secret = process.env.CRON_SECRET!;
  const { data, error } = await cronClient().rpc("tecnica_digest", { p_secret: secret, p_today: now.date });
  if (error) {
    console.error("tecnica_digest", error);
    return NextResponse.json({ error: "No se pudo armar el resumen" }, { status: 500 });
  }

  const digest = data as Digest;
  if (!digest.tasks.length || !digest.recipients.length) return NextResponse.json({ skipped: "nada que avisar" });

  const base = appUrl();
  const err = await sendBatch(
    digest.recipients.map((to) => renderDigest(digest, to, base)),
    `resumen-${now.date}`,
  );
  if (err) {
    console.error("resumen", err);
    return NextResponse.json({ error: err }, { status: 502 });
  }
  return NextResponse.json({ sent: digest.recipients.length, tasks: digest.tasks.length });
}
