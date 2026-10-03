export type TaskType = {
  id: string;
  position: number;
  name: string;
  description: string | null;
  needs: string;
  delivers: string;
  min_days: number;
  is_discovery: boolean;
};

export type ProjectOption = {
  id: string;
  name: string;
  client: string;
  event_date: string | null;
};

export type PersonOption = {
  id: string;
  full_name: string | null;
  email: string;
};

export const ATTACHMENT_KINDS = [
  { value: "briefing", label: "Briefing" },
  { value: "proposal", label: "Proposal" },
  { value: "plano", label: "Plano" },
  { value: "render", label: "Render" },
  { value: "otro", label: "Otro" },
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]["value"];

export const STORAGE_BUCKET = "archivos";

// Tipo de adjunto sugerido por el nombre del archivo
export function guessKind(fileName: string): AttachmentKind {
  const n = fileName.toLowerCase();
  if (/brief/.test(n)) return "briefing";
  if (/propos|propuesta/.test(n)) return "proposal";
  if (/plano|plan[ot]a?|rigging|\.dwg$|\.dxf$/.test(n)) return "plano";
  if (/render|\.(jpe?g|png|webp|heic)$/.test(n)) return "render";
  return "otro";
}

// Nombre seguro para la ruta en Storage (sin tildes, espacios ni simbolos)
export function safeFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot + 1) : "";
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  const b = clean(base) || "archivo";
  const e = clean(ext).toLowerCase();
  return e ? `${b}.${e}` : b;
}

export function personLabel(p: PersonOption): string {
  return p.full_name?.trim() || p.email;
}

export type TaskStatus = "recibida" | "falta_informacion" | "en_curso" | "entregada" | "cancelada";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  recibida: "Recibida",
  falta_informacion: "Falta información",
  en_curso: "En curso",
  entregada: "Entregada",
  cancelada: "Cancelada",
};
