import React from 'react'

import { site } from '../../lib/site'

/**
 * Marca en la parte alta del menú lateral del panel.
 *
 * El menú de fábrica de Payload no muestra ninguna marca: empieza directo con
 * la lista de colecciones. Este bloque va antes de esa lista (se registra en
 * payload.config.ts como `admin.components.beforeNavLinks`) y pone el isotipo
 * en gris claro y blanco sobre el fondo azul marino del menú, con el nombre de la empresa.
 *
 * Los estilos viven en app/(payload)/custom.css (clases `mx-marca*`).
 */
export default function MarcaDelPanel() {
  return (
    <div className="mx-marca">
      <span className="mx-marca__fila">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" aria-hidden="true" className="mx-marca__emblema" src="/logo-mark-white.png" />
        <span className="mx-marca__nombre">{site.brand.name}</span>
      </span>
      <span className="mx-marca__sub">Finanzas · panel</span>
    </div>
  )
}
