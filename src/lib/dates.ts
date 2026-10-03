// Fechas como "YYYY-MM-DD" en hora local (lo que muestra un <input type="date">)
export function todayISO(): string {
  const d = new Date();
  return toISO(d);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1, d + days));
}

export function daysBetween(fromISO: string, toISODate: string): number {
  const [y1, m1, d1] = fromISO.split("-").map(Number);
  const [y2, m2, d2] = toISODate.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// "mié 14.10" (formato de la casa); con año si no es el actual
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  // Acepta "YYYY-MM-DD" y tambien timestamps ISO completos
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(y, m - 1, d);
  const base = `${WEEKDAYS[date.getDay()]} ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
  return y === new Date().getFullYear() ? base : `${base}.${String(y).slice(2)}`;
}
