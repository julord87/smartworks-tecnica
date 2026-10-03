"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { changePassword, type PasswordState } from "./actions";

const INPUT =
  "min-h-11 border border-ink/40 bg-white px-3 text-base outline-none focus:border-sw-blue focus:ring-1 focus:ring-sw-blue";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, { status: "idle" });

  return (
    <form action={action} className="space-y-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-semibold">
          Nueva contraseña
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" className={INPUT} />
        <p className="text-sm text-muted">Al menos 8 caracteres.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="repeat" className="text-sm font-semibold">
          Repetir contraseña
        </label>
        <input id="repeat" name="repeat" type="password" autoComplete="new-password" className={INPUT} />
      </div>
      {state.status === "error" && (
        <p className="text-sm font-semibold text-st-falta" role="alert">
          {state.message}
        </p>
      )}
      {state.status === "ok" && (
        <p className="border-l-4 border-sw-blue bg-panel px-4 py-3 text-sm" role="status">
          Contraseña cambiada.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
