import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  enlace: "El enlace no es válido o ya caducó. Pide uno nuevo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Cabecera de la casa: rojo / azul / rojo */}
      <div className="bg-sw-red text-white">
        <div className="mx-auto flex h-7 max-w-6xl items-center justify-between px-4 text-[11px] font-bold tracking-wide">
          <span>PRODUCCIÓN TÉCNICA</span>
          <span>SMARTWORKS</span>
        </div>
      </div>
      <div className="bg-sw-blue text-white">
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-8 md:pt-16 md:pb-12">
          <h1 className="text-4xl leading-[1.05] font-extrabold italic uppercase tracking-tight md:text-6xl">
            Técnica
            <br />
            Smartworks
          </h1>
          <p className="mt-4 max-w-[46ch] text-base text-white/85">
            Pide trabajo a Producción Técnica y sigue el estado de cada tarea.
          </p>
        </div>
      </div>
      <div className="h-2 bg-sw-red" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 md:py-14">
        <div className="max-w-md">
          <h2 className="text-lg font-bold">Entrar</h2>
          <p className="mt-1 mb-6 text-sm text-muted">Con un enlace que te llega al correo, o con tu contraseña si tienes una.</p>
          {!isSupabaseConfigured && (
            <p className="mb-6 border-l-4 border-sw-red bg-panel px-4 py-3 text-sm" role="status">
              Configuración pendiente: faltan las variables de Supabase. El acceso se habilita al conectar la base de datos.
            </p>
          )}
          {error && ERRORS[error] && (
            <p className="mb-6 border-l-4 border-sw-red bg-panel px-4 py-3 text-sm" role="alert">
              {ERRORS[error]}
            </p>
          )}
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
