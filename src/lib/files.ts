// Enlace estable a un archivo privado (ver /api/archivo); usable en servidor y cliente
export function fileHref(path: string, name: string) {
  return `/api/archivo?path=${encodeURIComponent(path)}&nombre=${encodeURIComponent(name)}`;
}
