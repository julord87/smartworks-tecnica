import { STATUS_LABELS, type TaskStatus } from "@/lib/domain";

const STYLES: Record<TaskStatus, string> = {
  recibida: "bg-st-recibida-bg text-st-recibida",
  falta_informacion: "bg-st-falta-bg text-st-falta",
  en_curso: "bg-st-curso-bg text-st-curso",
  entregada: "bg-st-entregada-bg text-st-entregada",
  cancelada: "bg-st-cancelada-bg text-st-cancelada line-through",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-bold whitespace-nowrap uppercase ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
