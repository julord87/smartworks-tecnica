"use client";

import { useActionState } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="border-l-4 border-sw-blue bg-panel px-4 py-4" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <EnvelopeSimple size={20} weight="bold" className="text-sw-blue" />
          Revisa tu correo
        </p>
        <p className="mt-1 text-sm text-muted">
          Enviamos un enlace a <span className="font-semibold text-ink">{state.email}</span>. Vale 1 hora y sirve una sola vez.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-semibold">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.email}
          aria-invalid={state.status === "error"}
          aria-describedby="email-help email-error"
          className="min-h-11 border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue aria-[invalid=true]:border-sw-red"
        />
        <p id="email-help" className="text-sm text-muted">
          Tu dirección @smartworks.es, o la que Técnica haya autorizado.
        </p>
        {state.status === "error" && (
          <p id="email-error" className="text-sm font-semibold text-st-falta" role="alert">
            {state.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Enviando..." : "Enviar enlace"}
      </Button>
    </form>
  );
}
