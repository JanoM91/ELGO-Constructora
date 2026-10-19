import type { ServerProps } from 'payload'
import { createLocalReq } from 'payload'
import { Link } from '@payloadcms/ui'
import React from 'react'
import { permisosDe, usaInventario } from '../../lib/permisos'

/**
 * Enlace «Inventario» en el menú del panel (igual que EnlaceFinanzas).
 * Solo aparece si el rol de la persona usa Inventario.
 */
export default async function EnlaceInventario({ payload, user }: ServerProps) {
  if (!payload || !user) return null
  const req = await createLocalReq({ user: user as Parameters<typeof createLocalReq>[0]['user'] }, payload)
  const p = await permisosDe(req)
  if (!usaInventario(p)) return null
  const rutaAdmin = payload.config?.routes?.admin ?? '/admin'
  return (
    <>
      <div className="mx-nav-etiqueta">Inventario</div>
      <Link className="nav__link" href={`${rutaAdmin}/inventario`}>
        <span className="nav__link-label">Materiales, precios y existencias</span>
      </Link>
    </>
  )
}
