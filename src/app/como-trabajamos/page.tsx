import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Cómo trabajamos · Técnica Smartworks" };

export default async function HowWeWorkPage() {
  await requireProfile();
  const md = await readFile(path.join(process.cwd(), "content", "como-trabajamos.md"), "utf8");
  // Contenido propio del repo (no lo escriben usuarios), por eso se renderiza como HTML
  const html = await marked.parse(md.replace(/<!--[\s\S]*?-->/g, ""));

  const supabase = await createClient();
  const { data: types } = await supabase
    .from("task_types")
    .select("id, name, min_days, needs, delivers")
    .eq("active", true)
    .order("position");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <h1 className="text-3xl font-extrabold italic uppercase tracking-tight text-sw-blue md:text-4xl">Cómo trabajamos</h1>
      <article
        className="prose-sw mt-6"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <section aria-labelledby="plazos" className="prose-sw mt-10">
        <h2 id="plazos">Plazos mínimos</h2>
        <p>Días que Técnica necesita desde que tiene todo lo necesario para empezar.</p>
        <table>
          <thead>
            <tr>
              <th>Tarea</th>
              <th className="text-right">Días</th>
            </tr>
          </thead>
          <tbody>
            {(types ?? []).map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                  <span className="block text-sm text-muted">Para empezar: {t.needs}</span>
                </td>
                <td className="text-right font-bold tabular-nums">{t.min_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
