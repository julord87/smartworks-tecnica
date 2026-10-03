// Correos de notificacion: HTML de tablas con estilos en linea (compatibles con Outlook/Gmail) y version texto.
// Identidad de la casa: banda roja / bloque azul / banda roja, Arial, sin esquinas redondeadas.
import { shortDate } from "@/lib/dates";
import { STATUS_LABELS, type TaskStatus } from "@/lib/domain";

const BLUE = "#2E3192";
const RED = "#E5194B";
const INK = "#141414";
const MUTED = "#54565A";
const PANEL = "#F4F4F6";
const LINE = "#D9D9DE";
const FONT = "Arial, Helvetica, sans-serif";

export type NotificationKind = "pedido_nuevo" | "falta_informacion" | "entregada" | "cancelada" | "respuesta";

export type MailEvent = {
  id: number;
  kind: NotificationKind;
  task_id: string | null;
  task_name: string | null;
  due_date: string | null;
  body: string | null;
  actor: string | null;
  created_at: string;
  deliverable: { version: number; url: string | null; file_name: string | null; note: string | null } | null;
};

export type MailRequest = {
  id: string;
  comment: string | null;
  created_at: string;
  requested_by: string;
  project: {
    id: string;
    name: string;
    client: string;
    event_date: string | null;
    venue: string | null;
    supplier: string | null;
    pm: string;
  };
  tasks: { id: string; name: string; due_date: string; status: TaskStatus; notes: string | null; min_days: number }[];
  attachments: { file_name: string; kind: string }[];
};

export type QueuedMail = {
  to: string;
  recipient_name: string | null;
  reason: "tecnica" | "responsable" | "solicitante" | "pm" | "copia";
  ids: number[];
  request: MailRequest;
  events: MailEvent[];
};

export type RenderedMail = { to: string; subject: string; html: string; text: string };

const REASONS: Record<QueuedMail["reason"], string> = {
  tecnica: "Recibes este correo porque eres de Técnica.",
  responsable: "Recibes este correo porque eres responsable de la tarea.",
  solicitante: "Recibes este correo porque hiciste este pedido.",
  pm: "Recibes este correo porque eres el PM del proyecto.",
  copia: "Recibes este correo porque te pusieron en copia de este pedido.",
};

const KIND_TITLE: Record<NotificationKind, string> = {
  pedido_nuevo: "Nuevo pedido",
  falta_informacion: "Falta información",
  entregada: "Entregada",
  cancelada: "Cancelada",
  respuesta: "Respuesta del solicitante",
};

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function subjectFor(mail: QueuedMail): string {
  const project = mail.request.project.name;
  const kinds = new Set(mail.events.map((e) => e.kind));
  if (kinds.size === 1 && kinds.has("pedido_nuevo")) {
    return `Nuevo pedido: ${project} (${plural(mail.request.tasks.length, "tarea", "tareas")})`;
  }
  if (mail.events.length === 1) {
    const e = mail.events[0];
    return `${KIND_TITLE[e.kind]}: ${e.task_name ?? "tarea"} · ${project}`;
  }
  const action = kinds.has("falta_informacion") ? "Acción necesaria · " : "";
  return `${action}${project}: ${plural(mail.events.length, "novedad", "novedades")}`;
}

// --------------------------------------------------------------------------- piezas HTML

function layout(opts: { band: string; title: string; subband: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:${FONT};color:${INK};">
  <tr><td style="background:${RED};color:#ffffff;font-size:11px;font-weight:bold;padding:6px 20px;letter-spacing:0.5px;">${esc(opts.band)}</td></tr>
  <tr><td style="background:${BLUE};color:#ffffff;font-size:24px;font-weight:bold;font-style:italic;text-transform:uppercase;padding:18px 20px;">${esc(opts.title)}</td></tr>
  <tr><td style="background:${RED};color:#ffffff;font-size:12px;padding:6px 20px;">${esc(opts.subband)}</td></tr>
  <tr><td style="padding:24px 20px 8px 20px;font-size:15px;line-height:1.5;">${opts.body}</td></tr>
  <tr><td style="padding:16px 20px 32px 20px;font-size:12px;color:${MUTED};border-top:1px solid ${LINE};">${opts.footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px 0;"><tr>
<td style="background:${BLUE};"><a href="${esc(href)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-family:${FONT};font-size:14px;font-weight:bold;text-decoration:none;">${esc(label)}</a></td>
</tr></table>`;
}

function quote(text: string, color = BLUE): string {
  return `<div style="border-left:4px solid ${color};background:${PANEL};padding:10px 14px;margin:8px 0;">${nl2br(text)}</div>`;
}

function dataRows(rows: [string, string | null | undefined][]): string {
  const filled = rows.filter(([, v]) => v);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:4px 0 12px 0;">${filled
    .map(
      ([k, v]) =>
        `<tr><td style="color:${MUTED};padding:2px 16px 2px 0;vertical-align:top;">${esc(k)}</td><td style="padding:2px 0;font-weight:bold;">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

function tasksTable(tasks: MailRequest["tasks"]): string {
  const rows = tasks
    .map(
      (t, i) => `<tr style="background:${i % 2 ? "#FBFBFF" : "#ffffff"};">
<td style="padding:8px;border-bottom:1px solid ${LINE};font-weight:bold;">${esc(t.name)}${
        t.notes ? `<div style="font-weight:normal;color:${MUTED};font-size:13px;">${esc(t.notes)}</div>` : ""
      }</td>
<td style="padding:8px;border-bottom:1px solid ${LINE};white-space:nowrap;text-align:right;">${esc(shortDate(t.due_date))}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;margin:8px 0 16px 0;">
<tr><td style="background:${BLUE};color:#ffffff;font-size:11px;font-weight:bold;padding:6px 8px;">TAREA</td>
<td style="background:${BLUE};color:#ffffff;font-size:11px;font-weight:bold;padding:6px 8px;text-align:right;">FECHA LÍMITE</td></tr>${rows}</table>`;
}

// --------------------------------------------------------------------------- correo de eventos

export function renderNotification(mail: QueuedMail, appUrl: string): RenderedMail {
  const r = mail.request;
  const p = r.project;
  const subject = subjectFor(mail);
  const isNew = mail.events.every((e) => e.kind === "pedido_nuevo");
  const projectLine = [p.name, p.client, p.event_date ? shortDate(p.event_date) : null].filter(Boolean).join(" · ");

  const htmlParts: string[] = [];
  const textParts: string[] = [];

  if (isNew) {
    htmlParts.push(
      `<p style="margin:0 0 8px 0;"><strong>${esc(r.requested_by)}</strong> pidió ${plural(r.tasks.length, "tarea", "tareas")} para <strong>${esc(p.name)}</strong>.</p>`,
      tasksTable(r.tasks),
      dataRows([
        ["Cliente", p.client],
        ["Evento", p.event_date ? shortDate(p.event_date) : null],
        ["Venue", p.venue],
        ["Proveedor", p.supplier],
        ["PM", p.pm],
      ]),
    );
    if (r.comment) htmlParts.push(`<p style="margin:12px 0 0 0;font-weight:bold;">Comentario</p>`, quote(r.comment));
    if (r.attachments.length)
      htmlParts.push(
        `<p style="margin:12px 0 4px 0;font-weight:bold;">Adjuntos (${r.attachments.length})</p><p style="margin:0;color:${MUTED};font-size:14px;">${r.attachments
          .map((a) => esc(a.file_name))
          .join("<br>")}</p>`,
      );
    htmlParts.push(button(`${appUrl}/bandeja`, "Abrir la bandeja"));

    textParts.push(
      `${r.requested_by} pidió ${plural(r.tasks.length, "tarea", "tareas")} para ${p.name}.`,
      "",
      ...r.tasks.map((t) => `- ${t.name}: ${shortDate(t.due_date)}${t.notes ? ` (${t.notes})` : ""}`),
      "",
      `Cliente: ${p.client}`,
      p.event_date ? `Evento: ${shortDate(p.event_date)}` : "",
      p.venue ? `Venue: ${p.venue}` : "",
      p.supplier ? `Proveedor: ${p.supplier}` : "",
      `PM: ${p.pm}`,
      r.comment ? `\nComentario:\n${r.comment}` : "",
      r.attachments.length ? `\nAdjuntos: ${r.attachments.map((a) => a.file_name).join(", ")}` : "",
      "",
      `Abrir la bandeja: ${appUrl}/bandeja`,
    );
  } else {
    for (const e of mail.events.filter((x) => x.kind !== "pedido_nuevo")) {
      const color = e.kind === "falta_informacion" || e.kind === "cancelada" ? RED : BLUE;
      const taskUrl = `${appUrl}/tareas/${e.task_id}`;
      // Con un solo evento el titulo del correo ya dice el tipo
      if (mail.events.length > 1)
        htmlParts.push(
          `<p style="margin:16px 0 0 0;font-size:12px;font-weight:bold;color:${color};text-transform:uppercase;">${esc(KIND_TITLE[e.kind])}</p>`,
        );
      htmlParts.push(
        `<p style="margin:2px 0 0 0;font-size:17px;font-weight:bold;">${esc(e.task_name)}</p>`,
        `<p style="margin:2px 0 0 0;color:${MUTED};font-size:13px;">Fecha límite ${esc(shortDate(e.due_date))}${e.actor ? ` · ${esc(e.actor)}` : ""}</p>`,
      );
      textParts.push(`${KIND_TITLE[e.kind].toUpperCase()}: ${e.task_name} (fecha límite ${shortDate(e.due_date)})`);

      if (e.kind === "falta_informacion") {
        htmlParts.push(`<p style="margin:10px 0 0 0;">Para seguir, Técnica necesita:</p>`, quote(e.body ?? "", RED));
        textParts.push(`Para seguir, Técnica necesita:\n${e.body ?? ""}`);
      } else if (e.kind === "entregada") {
        const d = e.deliverable;
        const what = d ? `${d.file_name ?? "Entregable"} (v${d.version})` : "El entregable";
        htmlParts.push(`<p style="margin:10px 0 0 0;">${esc(what)} ya está disponible.</p>`);
        if (d?.note) htmlParts.push(quote(d.note));
        textParts.push(`${what} ya está disponible.${d?.note ? `\n${d.note}` : ""}`);
      } else if (e.body) {
        htmlParts.push(quote(e.body, color));
        textParts.push(e.body);
      }
      htmlParts.push(button(taskUrl, e.kind === "falta_informacion" ? "Responder en la tarea" : "Ver la tarea"));
      textParts.push(`Ver la tarea: ${taskUrl}`, "");
    }
  }

  const footer = `${esc(REASONS[mail.reason])}<br>Técnica Smartworks · ${esc(appUrl.replace(/^https?:\/\//, ""))}`;
  const html = layout({
    band: `TÉCNICA SMARTWORKS · ${p.name.toUpperCase()}`,
    title: isNew ? "Nuevo pedido" : mail.events.length === 1 ? KIND_TITLE[mail.events[0].kind] : "Novedades",
    subband: projectLine,
    body: htmlParts.join("\n"),
    footer,
  });
  const text = [projectLine, "", ...textParts, "", REASONS[mail.reason]].filter((l) => l !== null).join("\n");
  return { to: mail.to, subject, html, text };
}

// --------------------------------------------------------------------------- resumen diario

export type DigestTask = {
  id: string;
  name: string;
  due_date: string;
  status: TaskStatus;
  project: string;
  client: string;
  assignee: string | null;
  bucket: "vencida" | "hoy" | "manana" | "esperando";
  waiting_since: string | null;
};

export type Digest = { today: string; recipients: string[]; tasks: DigestTask[] };

const BUCKETS: { key: DigestTask["bucket"]; title: string; color: string }[] = [
  { key: "vencida", title: "Vencidas", color: RED },
  { key: "hoy", title: "Vencen hoy", color: BLUE },
  { key: "manana", title: "Vencen mañana", color: BLUE },
  { key: "esperando", title: "Esperando información hace 2 días o más", color: MUTED },
];

export function digestSubject(d: Digest): string {
  const count = (b: DigestTask["bucket"]) => d.tasks.filter((t) => t.bucket === b).length;
  const parts = [
    count("vencida") && plural(count("vencida"), "vencida", "vencidas"),
    count("hoy") && `${count("hoy")} hoy`,
    count("manana") && `${count("manana")} mañana`,
    count("esperando") && `${count("esperando")} esperando info`,
  ].filter(Boolean);
  return `Técnica ${shortDate(d.today)}: ${parts.join(", ")}`;
}

export function renderDigest(d: Digest, to: string, appUrl: string): RenderedMail {
  const html: string[] = [];
  const text: string[] = [];
  for (const b of BUCKETS) {
    const tasks = d.tasks.filter((t) => t.bucket === b.key);
    if (!tasks.length) continue;
    html.push(
      `<p style="margin:16px 0 4px 0;font-size:12px;font-weight:bold;color:${b.color};text-transform:uppercase;">${esc(b.title)} (${tasks.length})</p>`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">${tasks
        .map(
          (t) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${LINE};">
<a href="${esc(`${appUrl}/tareas/${t.id}`)}" style="color:${INK};font-weight:bold;text-decoration:none;">${esc(t.name)}</a>
<div style="color:${MUTED};font-size:13px;">${esc(t.project)} · ${esc(t.client)}${t.assignee ? ` · ${esc(t.assignee)}` : " · sin responsable"}</div></td>
<td style="padding:6px 0;border-bottom:1px solid ${LINE};text-align:right;white-space:nowrap;vertical-align:top;">${esc(shortDate(t.due_date))}</td></tr>`,
        )
        .join("")}</table>`,
    );
    text.push(
      `${b.title.toUpperCase()} (${tasks.length})`,
      ...tasks.map((t) => `- ${t.name} · ${t.project} · ${shortDate(t.due_date)}${t.assignee ? ` · ${t.assignee}` : ""}`),
      "",
    );
  }
  html.push(button(`${appUrl}/bandeja`, "Abrir la bandeja"));
  text.push(`Abrir la bandeja: ${appUrl}/bandeja`);
  return {
    to,
    subject: digestSubject(d),
    html: layout({
      band: "TÉCNICA SMARTWORKS",
      title: "Resumen del día",
      subband: shortDate(d.today),
      body: html.join("\n"),
      footer: `Resumen diario para Técnica. Solo se envía si hay algo que mirar.`,
    }),
    text: text.join("\n"),
  };
}
