"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle, Paperclip, Trash, WarningCircle, X } from "@phosphor-icons/react";
import { Button, buttonClass } from "@/components/ui/button";
import { PmList } from "@/components/pm-list";
import { ContactForm, ContactRow } from "@/components/contacts";
import { createClient } from "@/lib/supabase/client";
import { addDays, daysBetween, shortDate, todayISO } from "@/lib/dates";
import {
  ATTACHMENT_KINDS,
  STORAGE_BUCKET,
  guessKind,
  safeFileName,
  CONTACT_LABEL,
  type AttachmentKind,
  type Contact,
  type ContactDraft,
  type ContactKind,
  type PersonOption,
  type ProjectOption,
  type TaskType,
} from "@/lib/domain";
import { createRequest, registerAttachments, type UploadedFile } from "./actions";

type Props = {
  initialProjectId?: string;
  currentUserId: string;
  taskTypes: TaskType[];
  projects: ProjectOption[];
  people: PersonOption[];
  contacts: Contact[];
};

type Selected = { due: string; notes: string };
type PendingFile = { id: string; file: File; kind: AttachmentKind };
type Phase =
  | { step: "edit" }
  | { step: "sending"; label: string }
  | { step: "done"; requestId: string; failed: string[]; registerError?: string };

const INPUT =
  "min-h-11 w-full border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";
const LABEL = "text-sm font-semibold";
const SECTION = "border-t border-line pt-8 mt-10";
const SECTION_TITLE = "mb-1 text-sm font-bold uppercase tracking-wide text-sw-blue";
const MAX_MB = 100;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function NewRequestForm({ initialProjectId, currentUserId, taskTypes, projects, people, contacts }: Props) {
  const today = todayISO();
  const preset = projects.some((p) => p.id === initialProjectId) ? initialProjectId! : "";
  const [mode, setMode] = useState<"existente" | "nuevo">(projects.length ? "existente" : "nuevo");
  const [projectId, setProjectId] = useState(preset);
  const [newProject, setNewProject] = useState({
    name: "",
    client: "",
    event_date: "",
    venue: "",
    supplier: "",
    pm_ids: [currentUserId],
  });
  const [newContacts, setNewContacts] = useState<ContactDraft[]>([]);
  const [watchers, setWatchers] = useState<string[]>([]);
  const [watcherDraft, setWatcherDraft] = useState("");
  const [watcherError, setWatcherError] = useState("");
  const [selected, setSelected] = useState<Record<string, Selected>>({});
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ step: "edit" });
  const fileInput = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);

  const typeById = useMemo(() => new Map(taskTypes.map((t) => [t.id, t])), [taskTypes]);
  const selectedIds = taskTypes.filter((t) => selected[t.id]).map((t) => t.id);
  const discoverySelected = selectedIds.some((id) => typeById.get(id)?.is_discovery);
  // Contactos que exigen las tareas marcadas y cuáles faltan en el proyecto
  const projectContacts = mode === "existente" ? contacts.filter((c) => c.project_id === projectId) : [];
  const requiredKinds = [...new Set(selectedIds.flatMap((id) => typeById.get(id)?.required_contacts ?? []))] as ContactKind[];
  const haveKinds = new Set([...projectContacts, ...newContacts].map((c) => c.kind));
  const missingKinds = requiredKinds.filter((k) => !haveKinds.has(k));

  function toggleTask(t: TaskType) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[t.id]) delete next[t.id];
      else next[t.id] = { due: addDays(today, t.min_days), notes: "" };
      return next;
    });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const added = Array.from(list).map((file) => ({ id: crypto.randomUUID(), file, kind: guessKind(file.name) }));
    setFiles((prev) => [...prev, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function addWatcher() {
    const email = watcherDraft.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setWatcherError("Correo no válido.");
      return;
    }
    if (!watchers.includes(email)) setWatchers([...watchers, email]);
    setWatcherDraft("");
    setWatcherError("");
  }

  function validate(): string[] {
    const e: string[] = [];
    if (mode === "existente" && !projectId) e.push("Elige un proyecto o crea uno nuevo.");
    if (mode === "nuevo") {
      if (!newProject.name.trim()) e.push("Falta el nombre del proyecto.");
      if (!newProject.client.trim()) e.push("Falta el cliente del proyecto.");
    }
    if (selectedIds.length === 0) e.push("Marca al menos una tarea.");
    for (const id of selectedIds) {
      const s = selected[id];
      if (!s.due) e.push(`Falta la fecha límite de “${typeById.get(id)?.name}”.`);
      else if (s.due < today) e.push(`La fecha de “${typeById.get(id)?.name}” ya pasó.`);
    }
    if (missingKinds.length)
      e.push(`Faltan contactos del proyecto: ${missingKinds.map((k) => CONTACT_LABEL[k]).join(", ")}.`);
    if (discoverySelected && files.length === 0)
      e.push("Con “No sé qué necesito” hay que adjuntar al menos un archivo (briefing, proposal...).");
    const tooBig = files.filter((f) => f.file.size > MAX_MB * 1024 * 1024);
    for (const f of tooBig) e.push(`“${f.file.name}” supera ${MAX_MB} MB.`);
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    // Un correo escrito sin pulsar "Añadir" tambien cuenta
    const draft = watcherDraft.trim().toLowerCase();
    const allWatchers = draft && EMAIL_RE.test(draft) && !watchers.includes(draft) ? [...watchers, draft] : watchers;
    const e = validate();
    setErrors(e);
    if (e.length) {
      requestAnimationFrame(() => errorBox.current?.focus());
      return;
    }

    setPhase({ step: "sending", label: "Creando el pedido..." });
    const result = await createRequest({
      projectId: mode === "existente" ? projectId : null,
      newProject: mode === "nuevo" ? newProject : null,
      comment,
      watchers: allWatchers,
      contacts: newContacts,
      tasks: selectedIds.map((id) => ({ task_type_id: id, due_date: selected[id].due, notes: selected[id].notes })),
      fileCount: files.length,
    });
    if (!result.ok) {
      setErrors([result.error]);
      setPhase({ step: "edit" });
      requestAnimationFrame(() => errorBox.current?.focus());
      return;
    }

    // Subida directa navegador -> Storage (los archivos no pasan por el servidor de la app)
    const supabase = createClient();
    const uploaded: UploadedFile[] = [];
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setPhase({ step: "sending", label: `Subiendo archivos (${i + 1} de ${files.length})...` });
      const path = `${result.projectId}/requests/${result.requestId}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(f.file.name)}`;
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, f.file, { contentType: f.file.type || undefined, upsert: false });
      if (error) failed.push(f.file.name);
      else
        uploaded.push({
          storage_path: path,
          file_name: f.file.name,
          mime_type: f.file.type || null,
          size_bytes: f.file.size,
          kind: f.kind,
        });
    }

    let registerError: string | undefined;
    if (uploaded.length) {
      setPhase({ step: "sending", label: "Registrando archivos..." });
      const reg = await registerAttachments(result.projectId, result.requestId, uploaded);
      if (!reg.ok) registerError = reg.error;
    }

    setPhase({ step: "done", requestId: result.requestId, failed, registerError });
    window.scrollTo({ top: 0 });
  }

  if (phase.step === "done") {
    const project = mode === "existente" ? projects.find((p) => p.id === projectId)?.name : newProject.name;
    return (
      <section className="mt-8" aria-live="polite">
        <div className="border-l-4 border-sw-blue bg-panel px-5 py-5">
          <p className="flex items-center gap-2 text-lg font-bold">
            <CheckCircle size={24} weight="fill" className="text-sw-blue" />
            Pedido enviado
          </p>
          <p className="mt-1 text-muted">
            {project}: {selectedIds.length} {selectedIds.length === 1 ? "tarea" : "tareas"} para Técnica.
          </p>
        </div>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {selectedIds.map((id) => (
            <li key={id} className="flex items-baseline justify-between gap-4 py-3">
              <span className="font-semibold">{typeById.get(id)?.name}</span>
              <span className="shrink-0 text-sm text-muted">{shortDate(selected[id].due)}</span>
            </li>
          ))}
        </ul>
        {(phase.failed.length > 0 || phase.registerError) && (
          <div className="mt-6 border-l-4 border-sw-red bg-panel px-4 py-3 text-sm" role="alert">
            {phase.failed.length > 0 && <p>No se pudieron subir: {phase.failed.join(", ")}. Podrás adjuntarlos desde el proyecto.</p>}
            {phase.registerError && <p>{phase.registerError}</p>}
          </div>
        )}
        <a href="/pedidos/nuevo" className={buttonClass("secondary", "mt-8")}>
          Hacer otro pedido
        </a>
      </section>
    );
  }

  const sending = phase.step === "sending";

  return (
    <form onSubmit={submit} noValidate className="mt-8">
      {errors.length > 0 && (
        <div
          ref={errorBox}
          tabIndex={-1}
          role="alert"
          className="mb-8 border-l-4 border-sw-red bg-panel px-4 py-3 text-sm outline-none"
        >
          <p className="font-semibold">Revisa el pedido:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Proyecto */}
      <section aria-labelledby="sec-proyecto">
        <h2 id="sec-proyecto" className={SECTION_TITLE}>
          Proyecto
        </h2>
        <div role="radiogroup" aria-label="Proyecto" className="mt-3 grid grid-cols-2 border border-ink/40 text-sm">
          {(
            [
              ["existente", "Proyecto existente"],
              ["nuevo", "Proyecto nuevo"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              disabled={value === "existente" && projects.length === 0}
              onClick={() => setMode(value)}
              className={`min-h-11 px-3 font-semibold disabled:opacity-40 ${
                mode === value ? "bg-sw-blue text-white" : "bg-white text-ink hover:bg-panel"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "existente" ? (
          <div className="mt-5 flex flex-col gap-2">
            <label htmlFor="project" className={LABEL}>
              Proyecto
            </label>
            <select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={INPUT}>
              <option value="">Elige un proyecto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.client}
                  {p.event_date ? ` · ${shortDate(p.event_date)}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="np-name" className={LABEL}>
                Nombre del proyecto
              </label>
              <input
                id="np-name"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="np-client" className={LABEL}>
                Cliente
              </label>
              <input
                id="np-client"
                value={newProject.client}
                onChange={(e) => setNewProject({ ...newProject, client: e.target.value })}
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="np-date" className={LABEL}>
                Fecha del evento <span className="font-normal text-muted">(si la hay)</span>
              </label>
              <input
                id="np-date"
                type="date"
                value={newProject.event_date}
                onChange={(e) => setNewProject({ ...newProject, event_date: e.target.value })}
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="np-venue" className={LABEL}>
                Venue <span className="font-normal text-muted">(si lo hay)</span>
              </label>
              <input
                id="np-venue"
                value={newProject.venue}
                onChange={(e) => setNewProject({ ...newProject, venue: e.target.value })}
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="np-supplier" className={LABEL}>
                Proveedor técnico <span className="font-normal text-muted">(si lo hay)</span>
              </label>
              <input
                id="np-supplier"
                value={newProject.supplier}
                onChange={(e) => setNewProject({ ...newProject, supplier: e.target.value })}
                className={INPUT}
              />
            </div>
            <PmList
              id="np-pm"
              value={newProject.pm_ids}
              onChange={(ids) => setNewProject({ ...newProject, pm_ids: ids })}
              people={people}
              currentUserId={currentUserId}
            />
          </div>
        )}
      </section>

      {/* Tareas */}
      <section aria-labelledby="sec-tareas" className={SECTION}>
        <h2 id="sec-tareas" className={SECTION_TITLE}>
          Tareas
        </h2>
        <p className="text-sm text-muted">Cada tarea indica qué hace falta para empezar y qué entrega Técnica.</p>
        <div className="mt-4 grid gap-3">
          {taskTypes.map((t) => {
            const s = selected[t.id];
            const left = s?.due ? daysBetween(today, s.due) : null;
            const short = s?.due && left !== null && left < t.min_days;
            return (
              <div
                key={t.id}
                className={`border ${s ? "border-sw-blue" : "border-line"} ${t.is_discovery ? "border-l-4 border-l-sw-blue" : ""}`}
              >
                <label className="flex cursor-pointer gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={!!s}
                    onChange={() => toggleTask(t)}
                    className="mt-1 size-5 shrink-0 accent-sw-blue"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold">{t.name}</span>
                    <span className="mt-1 block text-sm text-muted">
                      <span className="font-semibold text-ink">Para empezar:</span> {t.needs}
                    </span>
                    <span className="block text-sm text-muted">
                      <span className="font-semibold text-ink">Entrega:</span> {t.delivers}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      Plazo mínimo: {t.min_days} {t.min_days === 1 ? "día" : "días"}
                      {t.is_discovery && " · Requiere adjuntos"}
                      {t.required_contacts.length > 0 &&
                        ` · Requiere contacto: ${t.required_contacts.map((k) => CONTACT_LABEL[k]).join(", ")}`}
                    </span>
                  </span>
                </label>
                {s && (
                  <div className="grid gap-4 border-t border-line bg-zebra p-4 md:grid-cols-[12rem_1fr]">
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`due-${t.id}`} className={LABEL}>
                        Fecha límite
                      </label>
                      <input
                        id={`due-${t.id}`}
                        type="date"
                        min={today}
                        value={s.due}
                        onChange={(e) => setSelected({ ...selected, [t.id]: { ...s, due: e.target.value } })}
                        aria-describedby={short ? `warn-${t.id}` : undefined}
                        className={INPUT}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`notes-${t.id}`} className={LABEL}>
                        Notas para esta tarea <span className="font-normal text-muted">(opcional)</span>
                      </label>
                      <input
                        id={`notes-${t.id}`}
                        value={s.notes}
                        onChange={(e) => setSelected({ ...selected, [t.id]: { ...s, notes: e.target.value } })}
                        className={INPUT}
                      />
                    </div>
                    {short && (
                      <p id={`warn-${t.id}`} className="flex gap-2 text-sm md:col-span-2" role="status">
                        <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0 text-sw-red" />
                        <span>
                          Técnica necesita al menos {t.min_days} días para esta tarea y quedan {left}. Lo más pronto
                          recomendable es {shortDate(addDays(today, t.min_days))}. Puedes enviarlo igual.
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Adjuntos */}
      {/* Contactos */}
      <section aria-labelledby="sec-contactos" className={SECTION}>
        <h2 id="sec-contactos" className={SECTION_TITLE}>
          Contactos del proyecto
        </h2>
        <p className="mb-4 text-sm text-muted">
          Proveedor, cliente, venue y técnico del venue. Quedan guardados en el proyecto para los próximos pedidos.
        </p>
        {requiredKinds.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Contactos que piden las tareas">
            {requiredKinds.map((k) => (
              <li
                key={k}
                className={`border px-3 py-1 font-semibold ${haveKinds.has(k) ? "border-line text-muted" : "border-sw-red text-sw-red"}`}
              >
                {haveKinds.has(k) ? "✓ " : "Falta: "}
                {CONTACT_LABEL[k]}
              </li>
            ))}
          </ul>
        )}
        {(projectContacts.length > 0 || newContacts.length > 0) && (
          <ul className="mb-4 divide-y divide-line border-y border-line">
            {projectContacts.map((c) => (
              <ContactRow key={c.id} c={c} />
            ))}
            {newContacts.map((c, i) => (
              <ContactRow key={`n${i}`} c={c} onRemove={() => setNewContacts(newContacts.filter((_, j) => j !== i))} />
            ))}
          </ul>
        )}
        <ContactForm
          idPrefix="nc"
          defaultKind={missingKinds[0] ?? "proveedor"}
          onAdd={(c) => setNewContacts([...newContacts, c])}
        />
      </section>

      <section aria-labelledby="sec-adjuntos" className={SECTION}>
        <h2 id="sec-adjuntos" className={SECTION_TITLE}>
          Adjuntos
        </h2>
        <p className="text-sm text-muted">
          Briefing, proposal, planos, renders. Hasta {MAX_MB} MB por archivo.
          {discoverySelected && <strong className="text-ink"> Obligatorio con “No sé qué necesito”.</strong>}
        </p>
        {files.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {files.map((f) => (
              <li key={f.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[1fr_10rem_auto]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{f.file.name}</span>
                  <span className="text-xs text-muted">{(f.file.size / 1024 / 1024).toFixed(1)} MB</span>
                </span>
                <select
                  aria-label={`Tipo de ${f.file.name}`}
                  value={f.kind}
                  onChange={(e) =>
                    setFiles(files.map((x) => (x.id === f.id ? { ...x, kind: e.target.value as AttachmentKind } : x)))
                  }
                  className={`${INPUT} col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto`}
                >
                  {ATTACHMENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((x) => x.id !== f.id))}
                  aria-label={`Quitar ${f.file.name}`}
                  className="col-start-2 row-start-1 inline-flex size-11 items-center justify-center text-muted hover:text-sw-red sm:col-start-3"
                >
                  <Trash size={20} weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileInput}
          id="files"
          type="file"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          className="sr-only"
        />
        <label htmlFor="files" className={buttonClass("secondary", "mt-4 cursor-pointer")}>
          <Paperclip size={18} weight="bold" />
          Añadir archivos
        </label>
      </section>

      {/* Comentario */}
      <section aria-labelledby="sec-comentario" className={SECTION}>
        <h2 id="sec-comentario" className={SECTION_TITLE}>
          <label htmlFor="comment">Comentario</label>
        </h2>
        <p className="mb-3 text-sm text-muted">Contexto general del pedido: qué es el evento, qué se espera, dudas.</p>
        <textarea
          id="comment"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className={`${INPUT} py-2`}
        />
      </section>

      {/* Avisos */}
      <section aria-labelledby="sec-avisos" className={SECTION}>
        <h2 id="sec-avisos" className={SECTION_TITLE}>
          Avisos por correo
        </h2>
        <p className="text-sm text-muted">
          Te avisamos a ti y a los PM del proyecto cuando una tarea queda en falta de información, se entrega o se cancela.
          Si alguien más tiene que enterarse, agrégalo.
        </p>
        {watchers.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {watchers.map((w) => (
              <li key={w} className="inline-flex items-center gap-1 border border-sw-blue py-1 pr-1 pl-3 text-sm">
                {w}
                <button
                  type="button"
                  onClick={() => setWatchers(watchers.filter((x) => x !== w))}
                  aria-label={`Quitar ${w}`}
                  className="inline-flex size-8 items-center justify-center text-muted hover:text-sw-red"
                >
                  <X size={16} weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="watcher" className={LABEL}>
            Notificar también a
          </label>
          <div className="flex gap-2">
            <input
              id="watcher"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={watcherDraft}
              onChange={(e) => setWatcherDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addWatcher();
                }
              }}
              aria-describedby="watcher-help"
              aria-invalid={!!watcherError}
              className={INPUT}
            />
            <Button type="button" variant="secondary" onClick={addWatcher}>
              Añadir
            </Button>
          </div>
          <p id="watcher-help" className={`text-sm ${watcherError ? "font-semibold text-st-falta" : "text-muted"}`}>
            {watcherError || "Solo correos internos (@smartworks.es o autorizados por Técnica)."}
          </p>
        </div>
      </section>

      {/* Barra de envio */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm text-muted" aria-live="polite">
            {sending
              ? phase.label
              : `${selectedIds.length} ${selectedIds.length === 1 ? "tarea" : "tareas"} · ${files.length} ${
                  files.length === 1 ? "adjunto" : "adjuntos"
                }`}
          </p>
          <Button type="submit" disabled={sending}>
            {sending ? "Enviando..." : "Enviar pedido"}
          </Button>
        </div>
      </div>
    </form>
  );
}
