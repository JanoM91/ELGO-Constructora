import type { ServerProps } from 'payload'
import { createLocalReq } from 'payload'
import { Link } from '@payloadcms/ui'
import React from 'react'
import { permisosDe, usaFinanzas } from '../../lib/permisos'

/**
 * Enlace «Finanzas» en el menú del panel (heredado de MacAuto Finanzas).
 *
 * Solo aparece si el rol de la persona usa Finanzas. Igual que los otros
 * enlaces del menú navy, el color lo pone app/(payload)/custom.css (§2.2):
 * todo lo que va dentro del menú tiene que decir su color.
 */
export default async function EnlaceFinanzas({ payload, user }: ServerProps) {
  if (!payload || !user) return null
  const req = await createLocalReq({ user: user as Parameters<typeof createLocalReq>[0]['user'] }, payload)
  const p = await permisosDe(req)
  if (!usaFinanzas(p)) return null
  const rutaAdmin = payload.config?.routes?.admin ?? '/admin'
  return (
    <>
      <div className="mx-nav-etiqueta">Finanzas</div>
      <Link className="nav__link" href={`${rutaAdmin}/finanzas`}>
        <span className="nav__link-label">Registro de entradas y gastos</span>
      </Link>
    </>
  )
}
