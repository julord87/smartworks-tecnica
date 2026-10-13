// Enlace estable a un archivo privado (ver /api/archivo); usable en servidor y cliente
export function fileHref(path: string, name: string) {
  return `/api/archivo?path=${encodeURIComponent(path)}&nombre=${encodeURIComponent(name)}`;
}

// Modelo 3D que la app puede mostrar en el visor (glTF binario exportado de Blender)
export const isModel3D = (name: string | null | undefined) => !!name && /\.glb$/i.test(name);
