import React from 'react'

import { site } from '../../lib/site'

/**
 * Ícono pequeño del panel: el que aparece en el encabezado superior como
 * botón de "inicio" de las migas de pan (Payload lo llama `graphics.Icon`).
 *
 * Usa el isotipo de ELGO (public/logo-mark.png). El logotipo completo
 * no cabe en 22 px; el isotipo sí.
 *
 * Se registra en payload.config.ts como `admin.components.graphics.Icon`.
 */
export default function Icono() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={site.brand.name} className="mx-icono" src="/logo-mark.png" />
  )
}
