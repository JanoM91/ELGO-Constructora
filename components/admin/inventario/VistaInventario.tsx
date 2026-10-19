import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import React from 'react'

import { esSoloCaptura, usaInventario } from '../../../lib/permisos'
import { catalogo, contextoDesdeReq } from '../../../lib/inventario/servicio'
import { site } from '../../../lib/site'
import AppInventario from './AppInventario'

/**
 * Inventario dentro del panel (misma idea que VistaFinanzas).
 *
 * Payload manda aquí todo lo que empiece con /admin/inventario. Pide sesión,
 * calcula permisos en el servidor y pinta la app dentro del panel (con menú)
 * o sola (celular) según el rol.
 */
export default async function VistaInventario({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const rutaAdmin = req.payload.config.routes.admin || '/admin'
  const segmentos = Array.isArray(params?.segments) ? (params.segments as string[]) : []
  const ruta = segmentos.slice(segmentos.indexOf('inventario') + 1)

  if (!req.user) {
    const vuelta = `${rutaAdmin}/${segmentos.join('/')}`
    redirect(`${rutaAdmin}/login?redirect=${encodeURIComponent(vuelta)}`)
  }

  const ctx = await contextoDesdeReq(req)
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(searchParams ?? {})) if (typeof v === 'string') query[k] = v

  const plantilla = (hijos: React.ReactNode) => (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>{hijos}</Gutter>
    </DefaultTemplate>
  )

  if (!ctx || !usaInventario(ctx.p)) {
    return plantilla(
      <div className="fz-app">
        <div className="fz-aviso fz-aviso--info" style={{ marginTop: 24 }}>
          <div>Tu rol no incluye Inventario. Si lo necesitas, pídelo a un dueño o al superadministrador (Usuarios → Rol de acceso → Inventario).</div>
        </div>
      </div>,
    )
  }

  const app = (
    <AppInventario
      catalogo={await catalogo(ctx)}
      ruta={ruta}
      query={query}
      rutaAdmin={rutaAdmin}
      soloCaptura={esSoloCaptura(ctx.p)}
      marca={{ wordmark: '/logo-mark-white.png', nombre: site.brand.name }}
    />
  )
  return ctx.p.panel ? plantilla(app) : app
}
