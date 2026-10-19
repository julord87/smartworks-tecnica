"use client";

import { createElement, useEffect, useState } from "react";

// Visor 3D interactivo (glTF binario, .glb exportado de Blender). Carga model-viewer solo cuando hace falta.
export function Model3D({ src, title }: { src: string; title: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    import("@google/model-viewer").then(() => setReady(true));
  }, []);

  return (
    <figure className="border border-line bg-panel">
      {ready ? (
        createElement("model-viewer", {
          src,
          alt: title,
          "camera-controls": "",
          "camera-orbit": "20deg 70deg 95%",
          // Sin esto no deja acercarse a una zona del venue (el radio mínimo por defecto es todo el modelo)
          "min-camera-orbit": "auto auto 1m",
          "max-field-of-view": "45deg",
          "touch-action": "pan-y",
          "shadow-intensity": "0.6",
          exposure: "1",
          style: { width: "100%", height: "min(60vh, 460px)", background: "#F3F3F3" },
        })
      ) : (
        <div className="grid h-[min(60vh,460px)] place-items-center text-sm text-muted">Cargando modelo 3D...</div>
      )}
      <figcaption className="border-t border-line px-3 py-2 text-xs text-muted">
        Arrastra para girar, pellizca o usa la rueda para acercar. {title}
      </figcaption>
    </figure>
  );
}
