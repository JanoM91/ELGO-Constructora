/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Permisos en el servidor — la parte que habla con Payload
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * QUÉ RESUELVE (heredado de MacAuto Finanzas, docs/60 de ese proyecto):
 *
 *   - Hay una colección «Roles» que los dueños y el superadministrador
 *     editan, y cada cuenta tiene uno.
 *   - Algunas personas solo registran entradas y gastos: entran directo a
 *     Finanzas y, para el resto del panel, cuentan como un visitante sin
 *     sesión. Eso lo hace `protegerColeccion()`, aplicada a TODAS las
 *     colecciones desde payload.config.ts, así que una colección nueva queda
 *     protegida sin que nadie se acuerde de hacerlo.
 *
 * Las reglas de qué permite cada rol están en lib/permisosBase.ts (puro,
 * probado sin base de datos). Aquí solo se lee el rol de la base y se
 * memoriza por petición para no consultarlo veinte veces.
 */
import type { Access, CollectionConfig, GlobalConfig, PayloadRequest } from 'payload'
import { calcularPermisos, type Permisos, type RolGuardado, usaFinanzas, usaInventario } from './permisosBase'

export type { Permisos } from './permisosBase'
export { esSoloCaptura, usaFinanzas, usaInventario } from './permisosBase'

type UsuarioConRol = {
  id?: number | string
  esSuperadmin?: boolean | null
  rolDeAcceso?: number | string | (RolGuardado & { id: number | string }) | null
}

const MEMO = '__permisosMx'

/** Permisos efectivos de quien hace la petición. Memorizados por petición. */
export async function permisosDe(req: PayloadRequest): Promise<Permisos> {
  const ctx = (req.context ?? {}) as Record<string, unknown>
  const usuario = req.user as UsuarioConRol | null | undefined
  const memo = ctx[MEMO] as { userId: unknown; permisos: Permisos } | undefined
  if (memo && memo.userId === usuario?.id) return memo.permisos

  let rol: RolGuardado | null = null
  const ref = usuario?.rolDeAcceso
  if (ref && typeof ref === 'object') rol = ref
  else if (ref != null) {
    try {
      rol = (await req.payload.findByID({ collection: 'roles', id: ref, depth: 0, overrideAccess: true, req })) as unknown as RolGuardado
    } catch {
      rol = null // un rol borrado no debe dar más permisos: la persona queda sin rol
    }
  }
  const permisos = calcularPermisos(usuario ?? null, rol)
  ctx[MEMO] = { userId: usuario?.id, permisos }
  if (!req.context) (req as { context: unknown }).context = ctx
  return permisos
}

/* ───────────────────── reglas listas para usar ───────────────────── */

export const conPanel: Access = async ({ req }) => Boolean(req.user) && (await permisosDe(req)).panel
export const gestionaUsuarios: Access = async ({ req }) => Boolean(req.user) && (await permisosDe(req)).gestionarUsuarios
export const configuraFinanzas: Access = async ({ req }) => Boolean(req.user) && (await permisosDe(req)).fin.configurar
export const usaFinanzasOPanel: Access = async ({ req }) => {
  if (!req.user) return false
  const p = await permisosDe(req)
  return p.panel || usaFinanzas(p)
}
export const nadie: Access = () => false

/* Inventario (ELGO Inventario, fase A). */
export const configuraInventario: Access = async ({ req }) => Boolean(req.user) && (await permisosDe(req)).inv.configurar
/** Materiales y equivalencias también los da de alta quien confirma documentos (Compras), no solo quien configura. */
export const editaCatalogoInventario: Access = async ({ req }) => {
  if (!req.user) return false
  const p = await permisosDe(req)
  return p.inv.configurar || p.inv.confirmar
}
export const usaInventarioOPanel: Access = async ({ req }) => {
  if (!req.user) return false
  const p = await permisosDe(req)
  return p.panel || usaInventario(p)
}

/* ─────────────── protección general de colecciones del sitio ─────────────── */

/**
 * Una persona con sesión pero SIN acceso al panel (solo captura) recibe
 * exactamente lo que recibiría un visitante sin sesión. Así:
 *   - si algún día se agrega una colección pública, la sigue viendo;
 *   - usuarios y lo privado, no;
 *   - y no puede crear, editar ni borrar nada del panel por la API.
 *
 * Para evaluar «como visitante» se llama a la regla original con una vista de
 * la petición donde `user` es null. Nada más cambia.
 */
function comoVisitante(req: PayloadRequest): PayloadRequest {
  return new Proxy(req, {
    get(target, prop) {
      if (prop === 'user') return null
      const v = Reflect.get(target, prop, target)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}

function envolver(original: Access | undefined): Access {
  return async (args) => {
    if (args.req.user && !(await permisosDe(args.req)).panel) {
      return original ? original({ ...args, req: comoVisitante(args.req) }) : false
    }
    /* Sin regla propia, Payload pide sesión iniciada: se conserva igual. */
    return original ? original(args) : Boolean(args.req.user)
  }
}

const OPERACIONES = ['read', 'create', 'update', 'delete', 'readVersions'] as const

/** Colecciones con reglas propias que no se envuelven. */
const CON_REGLAS_PROPIAS = new Set(['users', 'roles'])

export function protegerColeccion(c: CollectionConfig): CollectionConfig {
  if (CON_REGLAS_PROPIAS.has(c.slug) || c.slug.startsWith('fin-') || c.slug.startsWith('inv-')) return c
  const access = { ...(c.access ?? {}) } as NonNullable<CollectionConfig['access']>
  for (const op of OPERACIONES) {
    ;(access as Record<string, Access>)[op] = envolver((c.access as Record<string, Access> | undefined)?.[op])
  }
  return { ...c, access }
}

export function protegerGlobal(g: GlobalConfig): GlobalConfig {
  if (g.slug.startsWith('fin-') || g.slug.startsWith('inv-')) return g
  const access = { ...(g.access ?? {}) } as NonNullable<GlobalConfig['access']>
  for (const op of ['read', 'update', 'readVersions'] as const) {
    ;(access as Record<string, Access>)[op] = envolver((g.access as Record<string, Access> | undefined)?.[op])
  }
  return { ...g, access }
}
