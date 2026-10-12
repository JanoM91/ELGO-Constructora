import type { CollectionConfig } from 'payload'

import { APIError, ValidationError } from 'payload'
import type { Access, AccessResult, FieldAccess, Where } from 'payload'
import { permisosDe } from '../lib/permisos'

import {
  VIGENCIA_RECUPERACION_MS,
  asuntoDeRecuperacion,
  htmlDeRecuperacion,
  ligaDeRecuperacion,
} from '../lib/authEmails'
import { rateLimit } from '../lib/rateLimit'

/**
 * Frenos de la recuperación de contraseña.
 *
 * Por qué existen: la pantalla de «Olvidé mi contraseña» es pública y no pide
 * sesión. Sin un tope, cualquiera que conozca el correo de un administrador
 * puede dispararlo mil veces y llenarle el buzón, además de quemar la cuota de
 * Resend del negocio.
 *
 * Se cuenta por dos llaves distintas a propósito. El tope por dirección de
 * internet frena a quien prueba muchos correos desde una misma máquina; el
 * tope por correo frena a quien ataca un solo buzón desde muchas máquinas.
 * Ninguno de los dos solo alcanza.
 *
 * Límite conocido: el conteo vive en memoria (lib/rateLimit.ts), y Vercel puede
 * levantar varias instancias del sitio. En la práctica el freno es por
 * instancia, no global. Alcanza de sobra para el volumen de este panel; si
 * algún día hace falta que sea global, se mueve a Redis y este archivo no
 * cambia.
 */
/**
 * Quién puede ver y cambiar cuentas (octubre de 2026, docs/60).
 *
 * - Los dueños y el superadministrador (casilla «Administrar usuarios y roles»
 *   de su rol) ven y editan todas las cuentas, salvo las de un
 *   superadministrador: esas solo las toca otro superadministrador.
 * - Cualquier otra persona solo ve y edita la suya (nombre y contraseña). No
 *   puede cambiarse el rol.
 */
const leerCuentas: Access = async ({ req }): Promise<AccessResult> => {
  if (!req.user) return false
  if ((await permisosDe(req)).gestionarUsuarios) return true
  return { id: { equals: req.user.id } }
}
const noSuperadmin: Where = { or: [{ esSuperadmin: { equals: false } }, { esSuperadmin: { exists: false } }] }
const editarCuentas: Access = async ({ req }): Promise<AccessResult> => {
  if (!req.user) return false
  const p = await permisosDe(req)
  if (p.superadmin) return true
  if (p.gestionarUsuarios) return { or: [noSuperadmin, { id: { equals: req.user.id } }] }
  return { id: { equals: req.user.id } }
}
const borrarCuentas: Access = async ({ req }): Promise<AccessResult> => {
  if (!req.user) return false
  const p = await permisosDe(req)
  if (p.superadmin) return { id: { not_equals: req.user.id } }
  if (p.gestionarUsuarios) return { and: [noSuperadmin, { id: { not_equals: req.user.id } }] }
  return false
}
const crearCuentas: Access = async ({ req }) => Boolean(req.user) && (await permisosDe(req)).gestionarUsuarios
const cambiaRoles: FieldAccess = async ({ req }) => Boolean(req.user) && (await permisosDe(req)).gestionarUsuarios
/**
 * La marca de superadministrador solo la pone otro superadministrador. La
 * primera cuenta de la instalación (la que se crea en «Crear primer usuario»)
 * la recibe sola: ver el hook `beforeChange` más abajo.
 */
const marcaSuperadmin: FieldAccess = async ({ req }) => {
  if (!req.user) return false
  return (await permisosDe(req)).superadmin
}

const MAX_POR_IP = 5
const MAX_POR_CORREO = 3
const VENTANA_MS = 15 * 60 * 1000

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Usuario', plural: 'Usuarios' },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000, // 10 minutos tras 5 intentos fallidos
    /**
     * Cuánto dura una sesión sin volver a pedir contraseña: 7 días.
     *
     * El valor de fábrica de Payload son 2 horas. Para el panel en una laptop
     * daba igual, pero Finanzas se usa desde el icono del celular y
     * con 2 horas el equipo tenía que escribir su contraseña casi cada vez
     * que iba a registrar un gasto. Mismo valor que MacAuto Finanzas.
     *
     * Aplica a TODAS las cuentas del panel, no solo a las de Finanzas: Payload
     * no distingue por rol. Si se pierde un teléfono: Finanzas → Configuración
     * → «Si se pierde un teléfono» (cambiar la contraseña NO cierra sesiones).
     */
    tokenExpiration: 7 * 24 * 60 * 60,
    /**
     * Recuperación de contraseña.
     *
     * El envío en sí lo hace el adaptador de correo declarado en
     * payload.config.ts (lib/emailAdapter.ts). Aquí solo se define **qué dice**
     * el correo y **cuánto dura** la liga.
     *
     * Sobre la respuesta en pantalla: Payload contesta lo mismo exista o no la
     * cuenta ("si esa dirección tiene cuenta, te llegarán las instrucciones").
     * Es deliberado y se conserva: decir "ese correo no está registrado"
     * convertiría esta pantalla en un buscador de qué direcciones tienen acceso
     * al panel, que es justo lo que un atacante quiere averiguar antes de
     * intentar entrar.
     */
    forgotPassword: {
      expiration: VIGENCIA_RECUPERACION_MS,
      generateEmailSubject: () => asuntoDeRecuperacion(),
      generateEmailHTML: (args) =>
        htmlDeRecuperacion({
          liga: ligaDeRecuperacion({ req: args?.req, token: args?.token }),
          nombre: typeof args?.user?.name === 'string' ? args.user.name : undefined,
        }),
    },
  },
  access: {
    read: leerCuentas,
    create: crearCuentas,
    update: editarCuentas,
    delete: borrarCuentas,
    unlock: crearCuentas,
  },
  hooks: {
    /* La primera cuenta de la instalación nace superadministradora (es quien
       arranca: crea los roles sugeridos, las cuentas y las categorías). Toda
       cuenta posterior nace con un rol de acceso. */
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const hayCuentas = await req.payload.count({ collection: 'users', overrideAccess: true, req })
        if (hayCuentas.totalDocs === 0) return { ...data, esSuperadmin: true }
        if (!data?.rolDeAcceso && !data?.esSuperadmin) {
          throw new ValidationError({
            collection: 'users',
            errors: [{ path: 'rolDeAcceso', message: 'Elige el rol de acceso de esta persona.' }],
          })
        }
        return data
      },
    ],
    beforeOperation: [
      (arg) => {
        if (arg.operation !== 'forgotPassword') return arg.args

        const req = arg.req
        const ip =
          req?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ||
          req?.headers?.get?.('x-real-ip')?.trim() ||
          'desconocida'

        const correo =
          typeof arg.args?.data?.email === 'string'
            ? arg.args.data.email.toLowerCase().trim()
            : ''

        const pasaIp = rateLimit(`forgot:ip:${ip}`, MAX_POR_IP, VENTANA_MS)
        const pasaCorreo = correo
          ? rateLimit(`forgot:mail:${correo}`, MAX_POR_CORREO, VENTANA_MS)
          : true

        if (!pasaIp || !pasaCorreo) {
          /**
           * Se lanza el error en vez de fingir el envío. Al tronar aquí, la
           * transacción se revierte antes de escribir un token nuevo, así que
           * una liga legítima que ya iba en camino sigue sirviendo.
           *
           * En pantalla la persona ve el mismo mensaje neutro de siempre
           * (el formulario de Payload no mira el código de respuesta), que es
           * exactamente lo que conviene: quien esté abusando no se entera de
           * que lo frenaron.
           */
          throw new APIError('Demasiadas solicitudes de recuperación. Espera unos minutos.', 429)
        }

        return arg.args
      },
    ],
  },
  admin: {
    useAsTitle: 'email',
    group: 'Sistema',
    defaultColumns: ['name', 'email', 'rolDeAcceso', 'esSuperadmin'],
  },
  fields: [
    {
      name: 'name',
      label: 'Nombre',
      type: 'text',
      required: true,
    },
    {
      name: 'rolDeAcceso',
      label: 'Rol de acceso',
      type: 'relationship',
      relationTo: 'roles',
      admin: {
        position: 'sidebar',
        description: 'Define qué puede ver y hacer esta persona en el panel y en Finanzas. Los roles se editan en Sistema → Roles.',
      },
      access: { create: cambiaRoles, update: cambiaRoles },
    },
    {
      name: 'esSuperadmin',
      label: 'Superadministrador',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Puede todo, incluido administrar a los dueños. Solo otro superadministrador lo otorga.',
      },
      access: { create: marcaSuperadmin, update: marcaSuperadmin },
    },
  ],
}
