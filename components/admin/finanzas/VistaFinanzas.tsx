import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import React from 'react'

import { esSoloCaptura, usaFinanzas } from '../../../lib/permisos'
import { catalogo, contextoDesdeReq } from '../../../lib/finanzas/servicio'
import { site } from '../../../lib/site'
import AppFinanzas from './AppFinanzas'

/**
 * Finanzas dentro del panel (heredado de MacAuto Finanzas, docs/60).
 *
 * Payload manda aquí todo lo que empiece con /admin/finanzas (ver
 * payload.config.ts). Esta vista:
 *   1. pide sesión del panel (los accesos se administran en el mismo lugar:
 *      Usuarios y Roles);
 *   2. calcula los permisos de la persona en el servidor;
 *   3. si su rol entra al panel completo, pinta Finanzas dentro del panel
 *      (con su menú); si solo captura, la pinta sola, sin menú.
 */
export default async function VistaFinanzas({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const rutaAdmin = req.payload.config.routes.admin || '/admin'
  const segmentos = Array.isArray(params?.segments) ? (params.segments as string[]) : []
  const ruta = segmentos.slice(segmentos.indexOf('finanzas') + 1)

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

  if (!ctx || !usaFinanzas(ctx.p)) {
    return plantilla(
      <div className="fz-app">
        <div className="fz-aviso fz-aviso--info" style={{ marginTop: 24 }}>
          <div>Tu rol no incluye Finanzas. Si lo necesitas, pídelo a un dueño o al superadministrador (Usuarios → Rol de acceso).</div>
        </div>
      </div>,
    )
  }

  const app = (
    <AppFinanzas
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
