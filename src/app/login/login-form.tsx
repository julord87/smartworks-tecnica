"use client";

import { useActionState, useState } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { sendMagicLink, signInWithPassword, type LoginState } from "./actions";

type Mode = "enlace" | "clave";

const INPUT =
  "min-h-11 border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue aria-[invalid=true]:border-sw-red";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("enlace");
  const [linkState, linkAction, linkPending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });
  const [pwState, pwAction, pwPending] = useActionState<LoginState, FormData>(signInWithPassword, { status: "idle" });

  if (mode === "enlace" && linkState.status === "sent") {
    return (
      <div className="border-l-4 border-sw-blue bg-panel px-4 py-4" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <EnvelopeSimple size={20} weight="bold" className="text-sw-blue" />
          Revisa tu correo
        </p>
        <p className="mt-1 text-sm text-muted">
          Enviamos un enlace a <span className="font-semibold text-ink">{linkState.email}</span>. Vale 1 hora y sirve una sola vez.
        </p>
      </div>
    );
  }

  const state = mode === "enlace" ? linkState : pwState;
  const pending = mode === "enlace" ? linkPending : pwPending;

  return (
    <div>
      <div role="tablist" aria-label="Forma de acceso" className="mb-6 flex border-b border-line text-sm">
        {(
          [
            ["enlace", "Enlace por correo"],
            ["clave", "Contraseña"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`-mb-px border-b-2 px-3 py-2 font-semibold ${
              mode === value ? "border-sw-blue text-sw-blue" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form key={mode} action={mode === "enlace" ? linkAction : pwAction} className="space-y-5" noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-semibold">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete={mode === "clave" ? "username" : "email"}
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state.email}
            aria-invalid={state.status === "error"}
            aria-describedby="email-help email-error"
            className={INPUT}
          />
          {mode === "enlace" && (
            <p id="email-help" className="text-sm text-muted">
              Tu dirección @smartworks.es, o la que Técnica haya autorizado.
            </p>
          )}
        </div>

        {mode === "clave" && (
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-semibold">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              aria-invalid={state.status === "error"}
              className={INPUT}
            />
          </div>
        )}

        {state.status === "error" && (
          <p id="email-error" className="text-sm font-semibold text-st-falta" role="alert">
            {state.message}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {mode === "enlace" ? (pending ? "Enviando..." : "Enviar enlace") : pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
