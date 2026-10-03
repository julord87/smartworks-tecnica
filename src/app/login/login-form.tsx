"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900" role="status">
        Te enviamos un enlace a <strong>{state.email}</strong>. Ábrelo para entrar; vale 1 hora.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="nombre@smartworks.es"
          defaultValue={state.email}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>
      {state.status === "error" && (
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Enviarme el enlace de acceso"}
      </button>
    </form>
  );
}
