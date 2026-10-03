"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "@phosphor-icons/react";
import { Button, buttonClass } from "@/components/ui/button";
import { addDays, todayISO } from "@/lib/dates";
import { ATTACHMENT_KINDS, STATUS_LABELS, guessKind, type AttachmentKind, type TaskStatus } from "@/lib/domain";
import { uploadFile } from "@/lib/upload";
import {
  addComment,
  addDeliverable,
  addTasksToRequest,
  changeStatus,
  registerTaskAttachment,
  updateTask,
  type ActionResult,
} from "./actions";

const INPUT =
  "min-h-11 w-full border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";
const LABEL = "text-sm font-semibold";
const TITLE = "mb-3 text-sm font-bold uppercase tracking-wide text-sw-blue";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function run(fn: () => Promise<ActionResult>, okText: string, after?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg({ ok: true, text: okText });
        after?.();
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  }
  const feedback = msg && (
    <p
      role={msg.ok ? "status" : "alert"}
      className={`text-sm ${msg.ok ? "text-st-entregada" : "font-semibold text-st-falta"}`}
    >
      {msg.text}
    </p>
  );
  return { pending, run, feedback, setMsg };
}

// --------------------------------------------------------------------------- Estado (Tecnica)

const STATUSES: TaskStatus[] = ["recibida", "en_curso", "falta_informacion", "entregada", "cancelada"];

export function StatusPanel({ taskId, current, hasDeliverable }: { taskId: string; current: TaskStatus; hasDeliverable: boolean }) {
  const [status, setStatus] = useState<TaskStatus>(current);
  const [note, setNote] = useState("");
  const { pending, run, feedback } = useAction();
  const changed = status !== current;

  return (
    <section aria-labelledby="p-estado" className="border border-line p-4">
      <h2 id="p-estado" className={TITLE}>
        Cambiar estado
      </h2>
      <div role="radiogroup" aria-label="Estado" className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => setStatus(s)}
            className={`min-h-10 border px-3 text-sm font-semibold ${
              status === s ? "border-sw-blue bg-sw-blue text-white" : "border-ink/30 bg-white hover:bg-panel"
            }`}
          >
            {STATUS_LABELS[s]}
            {s === current && " (actual)"}
          </button>
        ))}
      </div>
      {changed && (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="status-note" className={LABEL}>
            {status === "falta_informacion" ? "¿Qué información falta?" : "Nota para el solicitante"}
            {status !== "falta_informacion" && <span className="font-normal text-muted"> (opcional)</span>}
          </label>
          <textarea
            id="status-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${INPUT} py-2`}
          />
          {status === "falta_informacion" && (
            <p className="text-sm text-muted">El solicitante recibe un correo con este texto.</p>
          )}
          {status === "entregada" && !hasDeliverable && (
            <p className="text-sm text-st-falta">
              Todavía no hay entregable. Mejor súbelo abajo y marca “entregada” desde ahí.
            </p>
          )}
          <div className="flex items-center gap-4">
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => changeStatus(taskId, status, note), "Estado actualizado.", () => setNote(""))}
            >
              {pending ? "Guardando..." : `Pasar a ${STATUS_LABELS[status].toLowerCase()}`}
            </Button>
            {feedback}
          </div>
        </div>
      )}
      {!changed && feedback && <div className="mt-3">{feedback}</div>}
    </section>
  );
}

// --------------------------------------------------------------------------- Responsable y fecha (Tecnica)

export function AssignPanel({
  taskId,
  assigneeId,
  due,
  people,
}: {
  taskId: string;
  assigneeId: string | null;
  due: string;
  people: { id: string; label: string }[];
}) {
  const { pending, run, feedback } = useAction();
  return (
    <section aria-labelledby="p-asignar" className="border border-line p-4">
      <h2 id="p-asignar" className={TITLE}>
        Responsable y fecha
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="assignee" className={LABEL}>
            Responsable
          </label>
          <select
            id="assignee"
            defaultValue={assigneeId ?? ""}
            disabled={pending}
            onChange={(e) =>
              run(() => updateTask(taskId, { assignee_id: e.target.value || null }), "Responsable actualizado.")
            }
            className={INPUT}
          >
            <option value="">Sin asignar</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="due" className={LABEL}>
            Fecha límite
          </label>
          <input
            id="due"
            type="date"
            defaultValue={due}
            disabled={pending}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== due)
                run(() => updateTask(taskId, { due_date: e.target.value }), "Fecha actualizada.");
            }}
            className={INPUT}
          />
        </div>
      </div>
      {feedback && <div className="mt-3">{feedback}</div>}
    </section>
  );
}

// --------------------------------------------------------------------------- Comentario + adjunto (miembros)

export function ReplyPanel({
  taskId,
  projectId,
  waitingInfo,
}: {
  taskId: string;
  projectId: string;
  waitingInfo: boolean;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<{ file: File; kind: AttachmentKind }[]>([]);
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { pending, run, feedback, setMsg } = useAction();

  async function send() {
    if (!body.trim() && !files.length) {
      setMsg({ ok: false, text: "Escribe un comentario o adjunta un archivo." });
      return;
    }
    run(async () => {
      for (const [i, f] of files.entries()) {
        setProgress(`Subiendo ${i + 1} de ${files.length}...`);
        const up = await uploadFile(`${projectId}/tasks/${taskId}`, f.file);
        if ("error" in up) return { ok: false, error: `No se pudo subir ${f.file.name}.` };
        const reg = await registerTaskAttachment(taskId, {
          storage_path: up.path,
          file_name: f.file.name,
          mime_type: f.file.type || null,
          size_bytes: f.file.size,
          kind: f.kind,
        });
        if (!reg.ok) return reg;
      }
      setProgress("");
      return body.trim() ? addComment(taskId, body) : { ok: true };
    }, "Enviado.", () => {
      setBody("");
      setFiles([]);
    });
  }

  return (
    <section aria-labelledby="p-responder" className={`border p-4 ${waitingInfo ? "border-sw-red" : "border-line"}`}>
      <h2 id="p-responder" className={TITLE}>
        {waitingInfo ? "Responder a Técnica" : "Comentar"}
      </h2>
      <label htmlFor="comment" className="sr-only">
        Comentario
      </label>
      <textarea
        id="comment"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={waitingInfo ? "Lo que pidió Técnica, o cuándo lo tendrás" : undefined}
        className={`${INPUT} py-2`}
      />
      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold">{f.file.name}</span>
              <select
                aria-label={`Tipo de ${f.file.name}`}
                value={f.kind}
                onChange={(e) =>
                  setFiles(files.map((x, j) => (j === i ? { ...x, kind: e.target.value as AttachmentKind } : x)))
                }
                className="min-h-9 border border-ink/40 px-2"
              >
                {ATTACHMENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-muted hover:text-sw-red"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        id="reply-files"
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []).map((file) => ({ file, kind: guessKind(file.name) }));
          setFiles([...files, ...list]);
          if (input.current) input.current.value = "";
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={send}>
          {pending ? progress || "Enviando..." : "Enviar"}
        </Button>
        <label htmlFor="reply-files" className={buttonClass("secondary", "cursor-pointer")}>
          <Paperclip size={18} weight="bold" />
          Adjuntar
        </label>
        {feedback}
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Entregable (Tecnica)

export function DeliverablePanel({ taskId, projectId, nextVersion }: { taskId: string; projectId: string; nextVersion: number }) {
  const [mode, setMode] = useState<"archivo" | "enlace">("archivo");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [deliver, setDeliver] = useState(true);
  const { pending, run, feedback } = useAction();

  function save() {
    run(async () => {
      if (mode === "archivo") {
        if (!file) return { ok: false, error: "Elige un archivo." };
        const up = await uploadFile(`${projectId}/tasks/${taskId}/entregables`, file);
        if ("error" in up) return { ok: false, error: "No se pudo subir el archivo." };
        return addDeliverable(taskId, { storage_path: up.path, file_name: name || file.name, note }, deliver);
      }
      return addDeliverable(taskId, { url: url.trim(), file_name: name, note }, deliver);
    }, `Entregable v${nextVersion} guardado.`, () => {
      setFile(null);
      setUrl("");
      setName("");
      setNote("");
    });
  }

  return (
    <section aria-labelledby="p-entregable" className="border border-line p-4">
      <h2 id="p-entregable" className={TITLE}>
        Subir entregable (v{nextVersion})
      </h2>
      <div role="radiogroup" aria-label="Tipo de entregable" className="mb-4 grid grid-cols-2 border border-ink/40 text-sm sm:max-w-xs">
        {(
          [
            ["archivo", "Archivo"],
            ["enlace", "Enlace"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={mode === v}
            onClick={() => setMode(v)}
            className={`min-h-10 font-semibold ${mode === v ? "bg-sw-blue text-white" : "bg-white hover:bg-panel"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "archivo" ? (
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Archivo</span>
            <input id="d-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sr-only" />
            <span className="flex min-h-11 items-center gap-3">
              <label htmlFor="d-file" className={buttonClass("secondary", "cursor-pointer")}>
                <Paperclip size={18} weight="bold" />
                Elegir archivo
              </label>
              <span className="min-w-0 truncate text-sm text-muted">{file?.name ?? "Ninguno"}</span>
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="d-url" className={LABEL}>
              Enlace (Drive, Dropbox, WeTransfer...)
            </label>
            <input id="d-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} className={INPUT} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="d-name" className={LABEL}>
            Nombre <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input id="d-name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor="d-note" className={LABEL}>
            Nota <span className="font-normal text-muted">(opcional, va en el correo)</span>
          </label>
          <input id="d-note" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={deliver} onChange={(e) => setDeliver(e.target.checked)} className="size-5 accent-sw-blue" />
        Marcar la tarea como entregada (avisa al solicitante)
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? "Guardando..." : "Guardar entregable"}
        </Button>
        {feedback}
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------- Tareas nuevas en pedidos "No se que necesito"

export function AddTasksPanel({
  taskId,
  requestId,
  types,
}: {
  taskId: string;
  requestId: string;
  types: { id: string; name: string; min_days: number }[];
}) {
  const today = todayISO();
  const [rows, setRows] = useState<{ task_type_id: string; due_date: string; notes: string }[]>([]);
  const { pending, run, feedback } = useAction();

  return (
    <section aria-labelledby="p-nuevas" className="border border-line p-4">
      <h2 id="p-nuevas" className={TITLE}>
        Agregar tareas a este pedido
      </h2>
      <p className="mb-3 text-sm text-muted">Resultado del análisis: las tareas que hacen falta para el proyecto.</p>
      {rows.map((r, i) => (
        <div key={i} className="mb-3 grid gap-2 border-b border-line pb-3 sm:grid-cols-[1fr_11rem_auto]">
          <select
            aria-label="Tarea"
            value={r.task_type_id}
            onChange={(e) => {
              const t = types.find((x) => x.id === e.target.value);
              setRows(rows.map((x, j) => (j === i ? { ...x, task_type_id: e.target.value, due_date: addDays(today, t?.min_days ?? 0) } : x)));
            }}
            className={INPUT}
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Fecha límite"
            type="date"
            min={today}
            value={r.due_date}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))}
            className={INPUT}
          />
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-sm text-muted hover:text-sw-red">
            Quitar
          </button>
          <input
            aria-label="Notas"
            placeholder="Notas (opcional)"
            value={r.notes}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
            className={`${INPUT} sm:col-span-3`}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows([...rows, { task_type_id: types[0].id, due_date: addDays(today, types[0].min_days), notes: "" }])}
        >
          Añadir tarea
        </Button>
        {rows.length > 0 && (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => addTasksToRequest(taskId, requestId, rows), "Tareas agregadas al pedido.", () => setRows([]))}
          >
            {pending ? "Guardando..." : `Agregar ${rows.length} ${rows.length === 1 ? "tarea" : "tareas"}`}
          </Button>
        )}
        {feedback}
      </div>
    </section>
  );
}
