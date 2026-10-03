import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  enlace: "El enlace no es válido o ya caducó. Pide uno nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Técnica Smartworks</h1>
      <p className="mt-1 mb-6 text-sm text-gray-600">Pedidos al área de Producción Técnica.</p>
      {error && ERRORS[error] && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {ERRORS[error]}
        </p>
      )}
      <LoginForm />
    </main>
  );
}
