/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Inventario — servicio (todo lo que escribe o lee datos de Inventario)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REGLA DE ORO (la misma de Finanzas): las pantallas y la API nunca leen ni
 * escriben las colecciones `inv-*` de registros directamente. Pasan por aquí,
 * donde se revisa, en este orden:
 *   1. qué permite el rol de la persona (lib/permisos.ts);
 *   2. que los datos sean válidos (lib/inventario/reglas.ts);
 *   3. y se escribe TODO junto en una transacción con su bitácora.
 *
 * ALCANCE: quien tiene `inv.obras === 'alcance'` solo ve y mueve material de
 * la bodega y de las ubicaciones ligadas a las obras de su alcance en
 * Finanzas (`fin.alcance`). El filtro se aplica en la consulta misma.
 *
 * FASE A (octubre de 2026): catálogo de materiales, proveedores, familias,
 * ubicaciones, existencias y movimientos, y arranque con semilla. Documentos,
 * lectura con Claude, empates, precios y pronóstico llegan en las fases B–D y
 * se agregan aquí mismo.
 */
import type { Payload, PayloadRequest, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { z } from 'zod'

import type { InvMaterial, InvMovimiento, InvUbicacion, User } from '../../payload-types'
import { permisosDe, type Permisos } from '../permisos'
import { site } from '../site'
import { aCentavos, diaEnZona, esFechaValida } from '../finanzas/reglas'
import {
  existenciasDesdeMovimientos,
  normalizarNumeroParte,
  revisarMovimiento,
  textoDeBusqueda,
  type TipoMovimiento,
  UNIDADES_BASE,
  type UnidadBase,
} from './reglas'
import type {
  CatalogoInventario,
  ExistenciaFila,
  ListaMateriales,
  MaterialConExistencias,
  MaterialVista,
  MovimientoVista,
  PermisosInventarioVista,
  Ref,
  ResultadoArranqueInventario,
} from './tipos'

/* ───────────────────────────── contexto y errores ───────────────────────────── */

export class ErrorInventario extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}
const prohibido = (m = 'Tu rol no permite hacer esto.') => new ErrorInventario(403, m)
const invalido = (m: string) => new ErrorInventario(400, m)
const noEncontrado = (m = 'No encontramos ese registro en tu alcance.') => new ErrorInventario(404, m)

export type Ctx = { payload: Payload; req: PayloadRequest; user: User; p: Permisos; hoy: string }

export async function contextoDesdeHeaders(payload: Payload, headers: Headers): Promise<Ctx | null> {
  const { user } = await payload.auth({ headers })
  if (!user) return null
  const req = await createLocalReq({ user: user as User & { collection: 'users' } }, payload)
  const p = await permisosDe(req)
  return { payload, req, user: user as User, p, hoy: diaEnZona(new Date(), site.location.timeZone) }
}

export async function contextoDesdeReq(req: PayloadRequest): Promise<Ctx | null> {
  if (!req.user) return null
  const p = await permisosDe(req)
  return { payload: req.payload, req, user: req.user as User, p, hoy: diaEnZona(new Date(), site.location.timeZone) }
}

export async function enTransaccion<T>(ctx: Ctx, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({ user: ctx.user as User & { collection: 'users' } }, ctx.payload)
  const propia = await initTransaction(req)
  try {
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

const esDuplicado = (e: unknown) => {
  const errores = (e as { data?: { errors?: { path?: string }[] } })?.data?.errors
  if (Array.isArray(errores) && errores.some((x) => x?.path === 'claveIdempotencia')) return true
  return /unique|duplicate|23505/i.test(String((e as { message?: string })?.message ?? e)) || (e as { code?: string })?.code === '23505'
}

/* ───────────────────────────── utilidades ───────────────────────────── */

const idDe = (v: unknown): number | null => {
  if (v == null) return null
  if (typeof v === 'object' && 'id' in (v as object)) return Number((v as { id: unknown }).id)
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const refDe = (v: unknown, campo = 'nombre'): Ref | null => {
  if (v && typeof v === 'object') {
    const x = v as Record<string, unknown>
    return { id: Number(x.id), nombre: String(x[campo] ?? x.nombreCorto ?? x.descripcion ?? x.name ?? '') }
  }
  return null
}
const nombreUsuario = (u: unknown): Ref => {
  if (u && typeof u === 'object') {
    const x = u as Partial<User>
    return { id: Number(x.id), nombre: x.name?.trim() || x.email?.split('@')[0] || 'Usuario' }
  }
  return { id: Number(u) || 0, nombre: 'Usuario' }
}
const textoCorto = (s: unknown, max = 200) => String(s ?? '').trim().slice(0, max)
const centavosDe = (pesos: unknown): number | null => (pesos == null || pesos === '' ? null : aCentavos(pesos))

async function bitacora(ctx: Ctx, req: PayloadRequest, data: { coleccion: string; registro?: number | null; documento?: number | null; accion: 'crear' | 'subir' | 'empatar' | 'confirmar' | 'anular' | 'movimiento' | 'corregir' | 'arranque'; campo?: string | null; valorAnterior?: string | null; valorNuevo?: string | null; motivo?: string | null }) {
  await ctx.payload.create({ collection: 'inv-bitacora', req, overrideAccess: true, data: { ...data, usuario: ctx.user.id } })
}

async function configuracion(ctx: Ctx) {
  const g = await ctx.payload.findGlobal({ slug: 'inv-configuracion', depth: 0, overrideAccess: true })
  return {
    tasaIva: typeof g?.tasaIva === 'number' ? g.tasaIva : 16,
    umbralAlertaPrecio: typeof g?.umbralAlertaPrecio === 'number' ? g.umbralAlertaPrecio : 5,
    diasPrecioViejo: typeof g?.diasPrecioViejo === 'number' ? g.diasPrecioViejo : 45,
    umbralConfianzaEmpate: typeof g?.umbralConfianzaEmpate === 'number' ? g.umbralConfianzaEmpate : 0.85,
    proveedorPreferido: idDe(g?.proveedorPreferido),
  }
}

/* ───────────────────────────── permisos y alcance ───────────────────────────── */

export function permisosVista(ctx: Ctx, obras: Ref[] = []): PermisosInventarioVista {
  const i = ctx.p.inv
  const nombres = ctx.p.fin.alcance.map((id) => obras.find((o) => o.id === Number(id))?.nombre).filter(Boolean)
  return {
    superadmin: ctx.p.superadmin, panel: ctx.p.panel, gestionarUsuarios: ctx.p.gestionarUsuarios,
    usar: i.usar, documentos: i.documentos, confirmar: i.confirmar, verPrecios: i.verPrecios, requisiciones: i.requisiciones, movimientos: i.movimientos, configurar: i.configurar,
    obras: ctx.p.superadmin ? 'todas' : i.obras,
    rolNombre: ctx.p.rolNombre,
    alcanceTexto: ctx.p.superadmin || i.obras === 'todas' ? 'Todas las obras y la bodega' : `La bodega y las obras: ${nombres.join(', ') || 'ninguna asignada'}`,
  }
}

function exigir(ctx: Ctx, casilla: keyof Permisos['inv'], mensaje?: string) {
  if (ctx.p.superadmin) return
  if (!ctx.p.inv[casilla]) throw prohibido(mensaje)
}

/** Ubicaciones que la persona alcanza: todas, o la bodega/vehículos/tránsito más las obras de su alcance. */
async function ubicacionesAlcanzables(ctx: Ctx): Promise<InvUbicacion[]> {
  const r = await ctx.payload.find({ collection: 'inv-ubicaciones', depth: 0, pagination: false, limit: 500, sort: 'nombre', overrideAccess: true })
  if (ctx.p.superadmin || ctx.p.inv.obras === 'todas') return r.docs
  const obras = new Set(ctx.p.fin.alcance.map(Number))
  return r.docs.filter((u) => u.tipo !== 'obra' || (idDe(u.obra) != null && obras.has(idDe(u.obra) as number)))
}

/* ───────────────────────────── catálogo ───────────────────────────── */

export async function catalogo(ctx: Ctx): Promise<CatalogoInventario> {
  const [conf, proveedores, familias, ubicaciones, obras, materiales, porRevisar] = await Promise.all([
    configuracion(ctx),
    ctx.payload.find({ collection: 'inv-proveedores', depth: 0, pagination: false, limit: 200, sort: 'nombreCorto', overrideAccess: true }),
    ctx.payload.find({ collection: 'inv-familias', depth: 0, pagination: false, limit: 500, sort: 'orden', overrideAccess: true }),
    ubicacionesAlcanzables(ctx),
    ctx.payload.find({ collection: 'fin-actividades', where: { and: [{ tipo: { equals: 'obra' } }, { activa: { equals: true } }] }, depth: 0, pagination: false, limit: 500, sort: 'nombre', overrideAccess: true, select: { nombre: true } }),
    ctx.payload.count({ collection: 'inv-materiales', where: { activo: { equals: true } }, overrideAccess: true }),
    ctx.payload.count({ collection: 'inv-documentos', where: { estado: { equals: 'por_revisar' } }, overrideAccess: true }),
  ])
  const obrasRef: Ref[] = obras.docs.map((o) => ({ id: o.id, nombre: o.nombre }))
  return {
    hoy: ctx.hoy,
    configuracion: conf,
    proveedores: proveedores.docs.map((p) => ({ id: p.id, nombre: p.nombre, nombreCorto: p.nombreCorto, tipo: p.tipo, prioridad: p.prioridad, activo: Boolean(p.activo) })),
    familias: familias.docs.map((f) => ({ id: f.id, nombre: f.nombre, padre: idDe(f.padre), orden: f.orden ?? 0, activa: Boolean(f.activa) })),
    ubicaciones: ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre, tipo: u.tipo, obra: idDe(u.obra), activa: Boolean(u.activa) })),
    obras: obrasRef,
    unidades: UNIDADES_BASE,
    permisos: permisosVista(ctx, obrasRef),
    usuario: nombreUsuario(ctx.user),
    totales: { materiales: materiales.totalDocs, documentosPorRevisar: ctx.p.inv.documentos || ctx.p.superadmin ? porRevisar.totalDocs : 0 },
  }
}

/* ───────────────────────────── materiales ───────────────────────────── */

function vistaMaterial(m: InvMaterial): MaterialVista {
  const a = m.atributos ?? {}
  const up = m.ultimoPrecio
  return {
    id: m.id,
    clave: m.clave ?? null,
    descripcion: m.descripcion,
    familia: refDe(m.familia),
    marca: m.marca ?? null,
    numeroParte: m.numeroParte ?? null,
    unidadBase: m.unidadBase as UnidadBase,
    critico: Boolean(m.critico),
    activo: Boolean(m.activo),
    atributos: {
      medida: a.medida ?? null, calibre: a.calibre ?? null, color: a.color ?? null, pared: (a.pared as 'pg' | 'pd' | 'na' | null) ?? null,
      longitudTramo: a.longitudTramo ?? null, pesoPorMetroKg: a.pesoPorMetroKg ?? null, amperes: a.amperes ?? null, polos: a.polos ?? null, tension: a.tension ?? null, acabado: a.acabado ?? null,
    },
    ultimoPrecio: up && typeof up.precioBase === 'number' ? { precioBaseCentavos: aCentavos(up.precioBase), proveedor: refDe(up.proveedor, 'nombreCorto'), fecha: up.fecha ?? null } : null,
    precioReferenciaCentavos: typeof m.precioReferencia === 'number' ? aCentavos(m.precioReferencia) : null,
    fechaUltimoMovimiento: m.fechaUltimoMovimiento ?? null,
  }
}

/** Mapa de existencias «material|ubicacion» → cantidad, solo de las ubicaciones alcanzables. */
async function mapaExistencias(ctx: Ctx, materiales?: number[]): Promise<{ mapa: Map<string, number>; ubicaciones: InvUbicacion[] }> {
  const ubicaciones = await ubicacionesAlcanzables(ctx)
  const ids = ubicaciones.map((u) => u.id)
  if (!ids.length) return { mapa: new Map(), ubicaciones }
  const where: Where = { and: [{ anulado: { not_equals: true } }, { or: [{ origen: { in: ids } }, { destino: { in: ids } }] }] }
  if (materiales?.length) (where.and as Where[]).push({ material: { in: materiales } })
  const r = await ctx.payload.find({ collection: 'inv-movimientos', where, depth: 0, pagination: false, limit: 100000, overrideAccess: true, select: { material: true, cantidad: true, origen: true, destino: true, anulado: true } })
  const permitidas = new Set(ids)
  const mapa = existenciasDesdeMovimientos(
    r.docs.map((m) => ({
      material: idDe(m.material) as number,
      cantidad: m.cantidad,
      origen: permitidas.has(idDe(m.origen) ?? -1) ? idDe(m.origen) : null,
      destino: permitidas.has(idDe(m.destino) ?? -1) ? idDe(m.destino) : null,
      anulado: m.anulado,
    })),
  )
  return { mapa, ubicaciones }
}

function conExistencias(m: MaterialVista, mapa: Map<string, number>, ubicaciones: InvUbicacion[]): MaterialConExistencias {
  const existencias = ubicaciones
    .map((u) => ({ ubicacion: { id: u.id, nombre: u.nombre }, cantidad: mapa.get(`${m.id}|${u.id}`) ?? 0 }))
    .filter((x) => x.cantidad !== 0)
  return { ...m, existencias, existenciaTotal: Math.round(existencias.reduce((s, x) => s + x.cantidad, 0) * 10000) / 10000 }
}

export async function materiales(ctx: Ctx, f: { texto?: string; familia?: number | null; activos?: string; pagina?: number }): Promise<ListaMateriales> {
  exigir(ctx, 'usar', 'Tu rol no incluye Inventario.')
  const y: Where[] = []
  if (f.activos !== 'todos') y.push({ activo: { equals: f.activos === 'inactivos' ? false : true } })
  if (f.familia) y.push({ familia: { equals: f.familia } })
  const texto = textoCorto(f.texto, 120)
  if (texto) {
    const t = textoDeBusqueda([texto])
    const fichas = t.split(' ').filter(Boolean)
    const np = normalizarNumeroParte(texto)
    y.push({
      or: [
        ...fichas.map((w) => ({ textoBusqueda: { contains: w } })),
        { clave: { contains: texto.toUpperCase() } },
        ...(np.length >= 4 ? [{ numeroParte: { contains: np } }] : []),
      ],
    })
  }
  const limit = 40
  const pagina = Math.max(1, Number(f.pagina) || 1)
  const r = await ctx.payload.find({ collection: 'inv-materiales', where: y.length ? { and: y } : {}, depth: 1, limit, page: pagina, sort: 'descripcion', overrideAccess: true, populate: { 'inv-familias': { nombre: true }, 'inv-proveedores': { nombreCorto: true } } })
  /* Con texto, se reordena por parecido: lo que comparte más fichas con lo buscado va primero. */
  let vistas = r.docs.map(vistaMaterial)
  if (texto) {
    const fichas = new Set(textoDeBusqueda([texto]).split(' ').filter(Boolean))
    const puntaje = (m: InvMaterial) => [...fichas].filter((w) => (m.textoBusqueda ?? '').includes(w)).length
    vistas = r.docs
      .map((d) => ({ d, s: puntaje(d) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => vistaMaterial(x.d))
  }
  const { mapa, ubicaciones } = await mapaExistencias(ctx, vistas.map((m) => m.id))
  return { materiales: vistas.map((m) => conExistencias(m, mapa, ubicaciones)), total: r.totalDocs, pagina: r.page ?? pagina, paginas: r.totalPages }
}

export async function material(ctx: Ctx, id: number): Promise<MaterialConExistencias & { movimientos: MovimientoVista[] }> {
  exigir(ctx, 'usar', 'Tu rol no incluye Inventario.')
  let m: InvMaterial
  try {
    m = await ctx.payload.findByID({ collection: 'inv-materiales', id, depth: 1, overrideAccess: true, populate: { 'inv-familias': { nombre: true }, 'inv-proveedores': { nombreCorto: true } } })
  } catch {
    throw noEncontrado()
  }
  const { mapa, ubicaciones } = await mapaExistencias(ctx, [id])
  const movs = await movimientos(ctx, { material: id })
  return { ...conExistencias(vistaMaterial(m), mapa, ubicaciones), movimientos: movs.movimientos }
}

const EsquemaMaterial = z.object({
  descripcion: z.string().trim().min(3, 'Escribe una descripción de al menos 3 letras.').max(200),
  familia: z.number().int().positive().nullable().optional(),
  marca: z.string().trim().max(80).nullable().optional(),
  numeroParte: z.string().trim().max(80).nullable().optional(),
  unidadBase: z.enum(UNIDADES_BASE.map((u) => u.value) as [UnidadBase, ...UnidadBase[]]),
  critico: z.boolean().optional(),
  atributos: z
    .object({
      medida: z.string().trim().max(40).nullable().optional(),
      calibre: z.string().trim().max(40).nullable().optional(),
      color: z.string().trim().max(40).nullable().optional(),
      pared: z.enum(['pg', 'pd', 'na']).nullable().optional(),
      longitudTramo: z.number().positive().nullable().optional(),
      pesoPorMetroKg: z.number().positive().nullable().optional(),
      amperes: z.number().nonnegative().nullable().optional(),
      polos: z.number().int().nonnegative().nullable().optional(),
      tension: z.string().trim().max(40).nullable().optional(),
      acabado: z.string().trim().max(60).nullable().optional(),
    })
    .optional(),
  notas: z.string().trim().max(1000).nullable().optional(),
})

/** Alta rápida desde la app (Compras y quien configura). La edición completa es en el panel. */
export async function crearMaterial(ctx: Ctx, entrada: unknown): Promise<{ id: number; clave: string | null; duplicadoDe?: Ref }> {
  if (!(ctx.p.superadmin || ctx.p.inv.confirmar || ctx.p.inv.configurar)) throw prohibido('Dar de alta materiales es de Compras o de quien configura Inventario.')
  const d = EsquemaMaterial.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa los datos del material.')
  const v = d.data
  const np = v.numeroParte ? normalizarNumeroParte(v.numeroParte) : ''
  if (np && v.marca && v.numeroParte) {
    const igual = await ctx.payload.find({ collection: 'inv-materiales', where: { and: [{ numeroParte: { equals: v.numeroParte.trim() } }, { marca: { equals: v.marca.trim() } }] }, depth: 0, limit: 1, overrideAccess: true })
    if (igual.docs[0]) throw invalido(`Ya existe ${igual.docs[0].clave ?? ''} «${igual.docs[0].descripcion}» con esa marca y número de parte.`)
  }
  return enTransaccion(ctx, async (req) => {
    const creado = await ctx.payload.create({
      collection: 'inv-materiales', req, overrideAccess: true,
      data: {
        descripcion: v.descripcion, familia: v.familia ?? null, marca: v.marca || null, numeroParte: v.numeroParte || null, unidadBase: v.unidadBase, critico: Boolean(v.critico),
        atributos: v.atributos ?? {}, notas: v.notas || null, activo: true,
      },
    })
    await bitacora(ctx, req, { coleccion: 'inv-materiales', registro: creado.id, accion: 'crear', valorNuevo: v.descripcion })
    const clave = creado.clave ?? `MAT-${String(creado.id).padStart(6, '0')}`
    return { id: creado.id, clave }
  })
}

/* ───────────────────────────── existencias y movimientos ───────────────────────────── */

export async function existencias(ctx: Ctx, f: { ubicacion?: number | null; texto?: string }): Promise<{ filas: ExistenciaFila[]; ubicaciones: Ref[] }> {
  exigir(ctx, 'usar', 'Tu rol no incluye Inventario.')
  const { mapa, ubicaciones } = await mapaExistencias(ctx)
  const porMaterial = new Map<number, { ubicacion: InvUbicacion; cantidad: number }[]>()
  for (const [k, q] of mapa) {
    if (!q) continue
    const [mat, ubi] = k.split('|').map(Number)
    if (f.ubicacion && ubi !== f.ubicacion) continue
    const u = ubicaciones.find((x) => x.id === ubi)
    if (!u) continue
    const lista = porMaterial.get(mat) ?? []
    lista.push({ ubicacion: u, cantidad: q })
    porMaterial.set(mat, lista)
  }
  const ids = [...porMaterial.keys()]
  if (!ids.length) return { filas: [], ubicaciones: ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre })) }
  const mats = await ctx.payload.find({ collection: 'inv-materiales', where: { id: { in: ids } }, depth: 0, pagination: false, limit: ids.length, overrideAccess: true, select: { descripcion: true, clave: true, unidadBase: true, textoBusqueda: true } })
  const texto = textoDeBusqueda([textoCorto(f.texto, 120)])
  const filas: ExistenciaFila[] = []
  for (const m of mats.docs) {
    if (texto && !texto.split(' ').every((w) => (m.textoBusqueda ?? '').includes(w))) continue
    for (const x of porMaterial.get(m.id) ?? []) {
      filas.push({
        material: { id: m.id, nombre: m.descripcion, clave: m.clave ?? null, unidadBase: m.unidadBase as UnidadBase },
        ubicacion: { id: x.ubicacion.id, nombre: x.ubicacion.nombre },
        cantidad: x.cantidad,
        porRecuperar: !x.ubicacion.activa && x.cantidad > 0,
      })
    }
  }
  filas.sort((a, b) => a.material.nombre.localeCompare(b.material.nombre, 'es') || a.ubicacion.nombre.localeCompare(b.ubicacion.nombre, 'es'))
  return { filas, ubicaciones: ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre })) }
}

function vistaMovimiento(m: InvMovimiento): MovimientoVista {
  return {
    id: m.id,
    tipo: m.tipo,
    material: refDe(m.material, 'descripcion') ?? { id: idDe(m.material) ?? 0, nombre: '' },
    cantidad: m.cantidad,
    origen: refDe(m.origen),
    destino: refDe(m.destino),
    obra: refDe(m.obra),
    fecha: m.fecha,
    motivo: m.motivo ?? null,
    registradoPor: nombreUsuario(m.registradoPor),
    anulado: Boolean(m.anulado),
    createdAt: m.createdAt,
  }
}

export async function movimientos(ctx: Ctx, f: { material?: number | null; ubicacion?: number | null; desde?: string; hasta?: string; pagina?: number }): Promise<{ movimientos: MovimientoVista[]; total: number; paginas: number }> {
  exigir(ctx, 'usar', 'Tu rol no incluye Inventario.')
  const ubicaciones = await ubicacionesAlcanzables(ctx)
  const ids = ubicaciones.map((u) => u.id)
  if (!ids.length) return { movimientos: [], total: 0, paginas: 0 }
  const y: Where[] = [{ or: [{ origen: { in: ids } }, { destino: { in: ids } }] }]
  if (f.material) y.push({ material: { equals: f.material } })
  if (f.ubicacion) y.push({ or: [{ origen: { equals: f.ubicacion } }, { destino: { equals: f.ubicacion } }] })
  if (esFechaValida(f.desde)) y.push({ fecha: { greater_than_equal: f.desde } })
  if (esFechaValida(f.hasta)) y.push({ fecha: { less_than_equal: f.hasta } })
  const r = await ctx.payload.find({
    collection: 'inv-movimientos', where: { and: y }, depth: 1, limit: 60, page: Math.max(1, Number(f.pagina) || 1), sort: '-fecha,-createdAt', overrideAccess: true,
    populate: { 'inv-materiales': { descripcion: true }, 'inv-ubicaciones': { nombre: true }, 'fin-actividades': { nombre: true }, users: { name: true, email: true } },
  })
  return { movimientos: r.docs.map(vistaMovimiento), total: r.totalDocs, paginas: r.totalPages }
}

const EsquemaMovimiento = z.object({
  tipo: z.enum(['entrada_compra', 'salida_obra', 'traspaso', 'devolucion', 'ajuste', 'merma', 'apertura']),
  material: z.number().int().positive(),
  cantidad: z.number().positive('La cantidad debe ser mayor que cero.'),
  origen: z.number().int().positive().nullable().optional(),
  destino: z.number().int().positive().nullable().optional(),
  fecha: z.string().optional(),
  motivo: z.string().trim().max(300).nullable().optional(),
  costoUnitario: z.union([z.number(), z.string()]).nullable().optional(),
})

export async function registrarMovimiento(ctx: Ctx, entrada: unknown, clave: string | null): Promise<{ id: number; duplicado: boolean }> {
  exigir(ctx, 'movimientos', 'Tu rol no incluye registrar movimientos de existencias.')
  const d = EsquemaMovimiento.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa los datos del movimiento.')
  const v = d.data
  const origen = v.origen ?? null
  const destino = v.destino ?? null
  const error = revisarMovimiento(v.tipo as TipoMovimiento, v.cantidad, origen, destino)
  if (error) throw invalido(error)
  /* Ajuste: positivo entra (destino), negativo sale (origen). La pantalla manda uno u otro. */
  const fecha = esFechaValida(v.fecha) ? v.fecha : ctx.hoy
  if (fecha > ctx.hoy) throw invalido('La fecha no puede ser futura.')
  if ((v.tipo === 'ajuste' || v.tipo === 'merma') && !textoCorto(v.motivo)) throw invalido('Escribe el motivo del ajuste o de la merma.')

  const alcanzables = await ubicacionesAlcanzables(ctx)
  const porId = new Map(alcanzables.map((u) => [u.id, u]))
  for (const id of [origen, destino]) {
    if (id == null) continue
    const u = porId.get(id)
    if (!u) throw noEncontrado('Esa ubicación no está en tu alcance.')
    if (!u.activa && id === destino) throw invalido(`«${u.nombre}» está desactivada: no se puede meter material ahí.`)
  }
  let mat: InvMaterial
  try {
    mat = await ctx.payload.findByID({ collection: 'inv-materiales', id: v.material, depth: 0, overrideAccess: true })
  } catch {
    throw noEncontrado('Ese material no existe.')
  }
  if (!mat.activo) throw invalido('Ese material está desactivado.')
  const obra = destino != null ? idDe(porId.get(destino)?.obra) : origen != null ? idDe(porId.get(origen)?.obra) : null
  const costo = centavosDe(v.costoUnitario)
  if (costo != null && Number.isNaN(costo)) throw invalido('El costo unitario no es un importe válido.')

  try {
    return await enTransaccion(ctx, async (req) => {
      const creado = await ctx.payload.create({
        collection: 'inv-movimientos', req, overrideAccess: true,
        data: {
          tipo: v.tipo, material: v.material, cantidad: v.cantidad, origen, destino, obra, fecha,
          motivo: textoCorto(v.motivo) || null, costoUnitarioBase: costo != null ? costo / 100 : null, registradoPor: ctx.user.id, claveIdempotencia: clave,
        },
      })
      await ctx.payload.update({ collection: 'inv-materiales', id: v.material, req, overrideAccess: true, depth: 0, data: { fechaUltimoMovimiento: fecha } })
      await bitacora(ctx, req, { coleccion: 'inv-movimientos', registro: creado.id, accion: 'movimiento', valorNuevo: `${v.tipo} · ${v.cantidad} ${mat.unidadBase} · ${mat.descripcion}` })
      return { id: creado.id, duplicado: false }
    })
  } catch (e) {
    if (clave && esDuplicado(e)) {
      const ya = await ctx.payload.find({ collection: 'inv-movimientos', where: { claveIdempotencia: { equals: clave } }, depth: 0, limit: 1, overrideAccess: true })
      if (ya.docs[0]) return { id: ya.docs[0].id, duplicado: true }
    }
    throw e
  }
}

export async function anularMovimiento(ctx: Ctx, id: number, entrada: unknown): Promise<void> {
  const d = z.object({ motivo: z.string().trim().min(3, 'Escribe el motivo.').max(300) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Escribe el motivo.')
  let m: InvMovimiento
  try {
    m = await ctx.payload.findByID({ collection: 'inv-movimientos', id, depth: 0, overrideAccess: true })
  } catch {
    throw noEncontrado()
  }
  if (m.anulado) throw invalido('Ese movimiento ya está anulado.')
  const propio = idDe(m.registradoPor) === ctx.user.id
  if (!(ctx.p.superadmin || ctx.p.inv.configurar || ctx.p.inv.confirmar || (propio && ctx.p.inv.movimientos))) throw prohibido('Solo quien lo registró, Compras o quien configura puede anular un movimiento.')
  await enTransaccion(ctx, async (req) => {
    await ctx.payload.update({ collection: 'inv-movimientos', id, req, overrideAccess: true, depth: 0, data: { anulado: true, motivoAnulacion: d.data.motivo } })
    await bitacora(ctx, req, { coleccion: 'inv-movimientos', registro: id, accion: 'anular', motivo: d.data.motivo })
  })
}

/* ───────────────────────────── arranque (semilla) ───────────────────────────── */

/** Proveedores conocidos de ELGO (proceso de cotización v0.2). Los datos de contacto los completa ELGO en el panel. */
const PROVEEDORES_SUGERIDOS: { nombre: string; nombreCorto: string; tipo: 'tienda' | 'distribuidor' | 'fabricante' | 'web'; prioridad: 'primera' | 'segunda' | 'foraneo' | 'referencia'; manejaSaldo?: boolean }[] = [
  { nombre: 'Eléctrico S.A. de C.V.', nombreCorto: 'Eléctrico', tipo: 'tienda', prioridad: 'primera', manejaSaldo: true },
  { nombre: 'M&M Alta y Media Tensión', nombreCorto: 'M&M', tipo: 'tienda', prioridad: 'primera' },
  { nombre: 'Sistelec', nombreCorto: 'Sistelec', tipo: 'tienda', prioridad: 'segunda' },
  { nombre: 'Cárdenas', nombreCorto: 'Cárdenas', tipo: 'tienda', prioridad: 'segunda' },
  { nombre: 'Referencia web', nombreCorto: 'Web', tipo: 'web', prioridad: 'referencia' },
]

const FAMILIAS_SUGERIDAS: { nombre: string; hijas: string[] }[] = [
  { nombre: 'Tableros y gabinetes', hijas: ['Interiores', 'Frentes y kits', 'Gabinetes'] },
  { nombre: 'Interruptores y protecciones', hijas: ['Termomagnéticos', 'I-Line', 'QO y enchufables', 'Fusibles y portafusibles'] },
  { nombre: 'Conductores', hijas: ['THW y THHN', 'Cable desnudo', 'Cable de uso rudo', 'Alambre'] },
  { nombre: 'Canalización', hijas: ['Tubo conduit', 'Coples y contras', 'Monitores y codos', 'Abrazaderas y unicanal', 'Cajas y registros'] },
  { nombre: 'Conectores y terminales', hijas: ['Zapatas', 'Capuchones y conectores', 'Cinta y aislamiento'] },
  { nombre: 'Fijación y ferretería', hijas: ['Taquetes y anclas', 'Tornillería', 'Rondanas y tuercas'] },
  { nombre: 'Alumbrado', hijas: ['Luminarias', 'Lámparas', 'Accesorios de alumbrado'] },
  { nombre: 'Obra civil', hijas: [] },
  { nombre: 'Herrería', hijas: [] },
  { nombre: 'Herramienta y EPP', hijas: [] },
  { nombre: 'Otros', hijas: [] },
]

/** `reqExterno`: para correr dentro de una transacción ya abierta (importación de lotes). */
export async function arranque(ctx: Ctx, entrada: unknown, reqExterno?: PayloadRequest): Promise<ResultadoArranqueInventario> {
  exigir(ctx, 'configurar')
  const d = z.object({ que: z.array(z.enum(['proveedores', 'familias', 'ubicaciones'])).min(1) }).safeParse(entrada)
  if (!d.success) throw invalido('Petición no válida.')
  const r: ResultadoArranqueInventario = { proveedores: 0, familias: 0, ubicaciones: 0, yaExistian: [] }
  const correr = reqExterno ? (fn: (req: PayloadRequest) => Promise<void>) => fn(reqExterno) : (fn: (req: PayloadRequest) => Promise<void>) => enTransaccion(ctx, fn)
  await correr(async (req) => {
    if (d.data.que.includes('proveedores')) {
      const ya = await ctx.payload.find({ collection: 'inv-proveedores', depth: 0, pagination: false, limit: 200, overrideAccess: true, select: { nombre: true } })
      const nombres = new Set(ya.docs.map((x) => x.nombre))
      for (const p of PROVEEDORES_SUGERIDOS) {
        if (nombres.has(p.nombre)) { r.yaExistian.push(p.nombre); continue }
        await ctx.payload.create({ collection: 'inv-proveedores', req, overrideAccess: true, data: { nombre: p.nombre, nombreCorto: p.nombreCorto, tipo: p.tipo, prioridad: p.prioridad, ciudad: p.tipo === 'web' ? '' : 'Xalapa', condiciones: { vigenciaDias: 15, manejaSaldoAFavor: Boolean(p.manejaSaldo) }, activo: true } })
        r.proveedores++
      }
    }
    if (d.data.que.includes('familias')) {
      const ya = await ctx.payload.find({ collection: 'inv-familias', depth: 0, pagination: false, limit: 500, overrideAccess: true, select: { nombre: true, padre: true } })
      const existentes = new Map(ya.docs.map((x) => [`${idDe(x.padre) ?? 0}|${x.nombre}`, x.id]))
      let orden = 0
      for (const f of FAMILIAS_SUGERIDAS) {
        orden += 10
        let padre = existentes.get(`0|${f.nombre}`)
        if (padre) r.yaExistian.push(f.nombre)
        else {
          padre = (await ctx.payload.create({ collection: 'inv-familias', req, overrideAccess: true, data: { nombre: f.nombre, orden, activa: true } })).id
          r.familias++
        }
        let sub = 0
        for (const h of f.hijas) {
          sub++
          if (existentes.has(`${padre}|${h}`)) continue
          await ctx.payload.create({ collection: 'inv-familias', req, overrideAccess: true, data: { nombre: h, padre, orden: orden + sub, activa: true } })
          r.familias++
        }
      }
    }
    if (d.data.que.includes('ubicaciones')) {
      const ya = await ctx.payload.find({ collection: 'inv-ubicaciones', depth: 0, pagination: false, limit: 500, overrideAccess: true, select: { nombre: true, obra: true, tipo: true } })
      if (!ya.docs.some((u) => u.tipo === 'bodega')) {
        await ctx.payload.create({ collection: 'inv-ubicaciones', req, overrideAccess: true, data: { nombre: 'Bodega ELGO', tipo: 'bodega', activa: true } })
        r.ubicaciones++
      } else r.yaExistian.push('Bodega')
      /* Una ubicación por obra activa de Finanzas que aún no tenga la suya. */
      const conObra = new Set(ya.docs.map((u) => idDe(u.obra)).filter((x): x is number => x != null))
      const obras = await ctx.payload.find({ collection: 'fin-actividades', where: { and: [{ tipo: { equals: 'obra' } }, { activa: { equals: true } }] }, depth: 0, pagination: false, limit: 500, overrideAccess: true, select: { nombre: true } })
      const nombres = new Set(ya.docs.map((u) => u.nombre))
      for (const o of obras.docs) {
        if (conObra.has(o.id)) continue
        const nombre = nombres.has(o.nombre) ? `Obra · ${o.nombre}` : o.nombre
        await ctx.payload.create({ collection: 'inv-ubicaciones', req, overrideAccess: true, data: { nombre, tipo: 'obra', obra: o.id, activa: true } })
        r.ubicaciones++
      }
    }
    await bitacora(ctx, req, { coleccion: 'inv-configuracion', accion: 'arranque', valorNuevo: `${d.data.que.join(', ')}: ${r.proveedores} proveedores, ${r.familias} familias, ${r.ubicaciones} ubicaciones` })
  })
  return r
}
