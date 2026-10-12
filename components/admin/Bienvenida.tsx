import type { ServerProps } from 'payload'
import { createLocalReq } from 'payload'

import { Link } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import React from 'react'

import { fechaLegible, partesLocales } from '../../lib/localTime'
import { esSoloCaptura, permisosDe, usaFinanzas } from '../../lib/permisos'

/**
 * Bienvenida del tablero del panel (heredada de MacAuto, docs/58 y docs/60).
 *
 * Va antes de la cuadrícula de fábrica de Payload (`admin.components.beforeDashboard`)
 * y hace dos cosas: saluda a quien entró, con la fecha, y pone a un clic lo
 * que se usa: Finanzas y la administración de personas y catálogos.
 *
 * Quien solo registra entradas y gastos (su rol no entra al panel completo)
 * no tiene nada que hacer en este tablero: se le manda directo a Finanzas.
 */

/** Accesos de la franja. Orden = orden visual. Finanzas se agrega arriba si el rol la usa. */
const ACCESOS: { etiqueta: string; ruta: string; destacado?: boolean }[] = [
  { etiqueta: 'Usuarios', ruta: '/collections/users' },
  { etiqueta: 'Roles', ruta: '/collections/roles' },
  { etiqueta: 'Cuentas y cajas', ruta: '/collections/fin-cuentas' },
  { etiqueta: 'Categorías', ruta: '/collections/fin-categorias' },
]

function saludoSegunHora(fecha: Date): string {
  /* La hora se lee en la zona del negocio (lib/site.ts), no en la del servidor
     (Vercel corre en UTC). `partesLocales` ya resuelve eso. */
  const { hour: hora } = partesLocales(fecha)
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export default async function Bienvenida({ payload, user }: ServerProps) {
  const rutaAdmin = payload?.config?.routes?.admin ?? '/admin'

  /* Quien solo registra entradas y gastos se va directo a Finanzas. */
  let conFinanzas = false
  if (payload && user) {
    const req = await createLocalReq({ user: user as Parameters<typeof createLocalReq>[0]['user'] }, payload)
    const p = await permisosDe(req)
    if (esSoloCaptura(p)) redirect(`${rutaAdmin}/finanzas`)
    conFinanzas = usaFinanzas(p)
  }
  const accesos = conFinanzas ? [{ etiqueta: 'Finanzas', ruta: '/finanzas', destacado: true }, ...ACCESOS] : ACCESOS

  /* El usuario de Payload trae `email`; el nombre existe solo si la colección
     de usuarios lo define, así que se lee con cuidado. */
  const persona = user as { email?: string; name?: string } | undefined
  const nombre = persona?.name?.trim() || persona?.email?.split('@')[0] || ''
  const ahora = new Date()

  return (
    <section aria-label="Bienvenida" className="mx-bienvenida">
      <div className="mx-bienvenida__texto">
        <p className="mx-bienvenida__fecha">{fechaLegible(ahora)}</p>
        <h1 className="mx-bienvenida__saludo">
          {saludoSegunHora(ahora)}
          {nombre ? `, ${nombre}` : ''}
        </h1>
        <p className="mx-bienvenida__bajada">
          Las entradas y los gastos se registran en Finanzas. Aquí abajo administras personas,
          roles y catálogos.
        </p>
      </div>
      <nav aria-label="Accesos directos" className="mx-bienvenida__acciones">
        {accesos.map((a) => (
          <Link
            className={`mx-bienvenida__accion ${
              a.destacado ? 'mx-bienvenida__accion--teal' : 'mx-bienvenida__accion--claro'
            }`}
            href={`${rutaAdmin}${a.ruta}`}
            key={a.ruta}
          >
            {a.etiqueta}
          </Link>
        ))}
      </nav>
    </section>
  )
}
