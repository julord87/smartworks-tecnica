import { shortDate } from "@/lib/dates";

// Fecha limite con el tiempo que queda; en rojo solo si esta vencida y la tarea sigue abierta
export function DueLabel({ due, daysLeft, open }: { due: string; daysLeft: number; open: boolean }) {
  const rel =
    daysLeft < 0
      ? `vencida hace ${-daysLeft} ${daysLeft === -1 ? "día" : "días"}`
      : daysLeft === 0
        ? "vence hoy"
        : daysLeft === 1
          ? "vence mañana"
          : `en ${daysLeft} días`;
  const urgent = open && daysLeft <= 0;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="font-bold">{shortDate(due)}</span>
      {open && <span className={`ml-2 text-xs ${urgent ? "font-bold text-sw-red" : "text-muted"}`}>{rel}</span>}
    </span>
  );
}
