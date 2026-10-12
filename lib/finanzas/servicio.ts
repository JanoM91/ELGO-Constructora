/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Finanzas — servicio (todo lo que escribe o lee datos financieros)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REGLA DE ORO: las pantallas y la API nunca leen ni escriben las colecciones
 * `fin-*` directamente. Pasan por aquí, donde se revisa, en este orden:
 *   1. qué permite el rol de la persona (lib/permisos.ts);
 *   2. que los datos sean válidos (lib/finanzas/reglas.ts);
 *   3. y se escribe TODO junto en una transacción: si algo falla, no queda
 *      una operación sin su movimiento ni un movimiento sin su bitácora.
 *
 * VISIBILIDAD: quien no tiene la casilla «Ver categorías restringidas» nunca
 * recibe una operación de nómina: ni en listas, ni en búsquedas, ni en
 * totales, ni en archivos. El filtro se aplica en la consulta misma.
 *
 * Heredado de MacAuto Finanzas (docs/60-62 de ese proyecto) por la vía de
 * Orthopedic Vet's Finanzas, sin la parte de autos: aquí cada entrada o gasto
 * se asigna a una OBRA o a un área de soporte de ELGO (colección
 * `fin-actividades`), a «general» o queda pendiente de asignar. `obras()`
 * arma el resultado por obra.
 * Etapa 1: entradas y gastos, realizados o pendientes, con cobros y
 * pagos parciales, comprobantes privados, correcciones,
 * clasificación, anulación y bitácora.
 * Etapa 3 (docs/62): traspasos entre cuentas, fondos a cargo de empleados,
 * gastos pagados de la bolsa con su reembolso, aportaciones y retiros de socios.
 * Etapa 4 (docs/62): la nota de voz llega por lib/finanzas/voz.ts y entra por
 * `registrar` como cualquier captura, con `origen: 'voz'`.
 */
import type { Payload, PayloadRequest, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { get as blobGet, put as blobPut } from '@vercel/blob'
import { z } from 'zod'

import type { FinCategoria, FinComprobante, FinCuenta, FinMovimiento, FinOperacion, User } from '../../payload-types'
import { permisosDe, type Permisos } from '../permisos'
import { site } from '../site'
import {
  aCentavos,
  aPesos,
  conceptoInterno,
  diaEnZona,
  esFechaValida,
  estadoDePago,
  formatoMXN,
  resumenDeFondo,
  revisarFechaReal,
  saldoDeCuenta,
  sumarDias,
  tieneDosDecimalesOMenos,
} from './reglas'
import type {
  BitacoraVista,
  Catalogo,
  ComprobanteVista,
  CuentaVista,
  DetalleOperacion,
  Fondos,
  ListaOperaciones,
  MovimientoVista,
  OperacionVista,
  Pendientes,
  PermisosVista,
  PersonaBreve,
  PersonaConSesiones,
  ResultadoObras,
  FilaObra,
  Resumen,
  Saldos,
} from './tipos'

/* ───────────────────────────── contexto y errores ───────────────────────────── */

export class ErrorFinanzas extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}
const prohibido = (m = 'Tu rol no permite hacer esto.') => new ErrorFinanzas(403, m)
const invalido = (m: string) => new ErrorFinanzas(400, m)
const noEncontrado = (m = 'No encontramos ese registro en tu alcance.') => new ErrorFinanzas(404, m)

export type Ctx = { payload: Payload; req: PayloadRequest; user: User; p: Permisos; hoy: string }

/** Arma el contexto a partir de la sesión del panel (cookie de Payload). */
export async function contextoDesdeHeaders(payload: Payload, headers: Headers): Promise<Ctx | null> {
  const { user } = await payload.auth({ headers })
  if (!user) return null
  const req = await createLocalReq({ user: user as User & { collection: 'users' } }, payload)
  const p = await permisosDe(req)
  return { payload, req, user: user as User, p, hoy: diaEnZona(new Date(), site.location.timeZone) }
}

/** Contexto para una vista del panel que ya tiene la petición de Payload. */
export async function contextoDesdeReq(req: PayloadRequest): Promise<Ctx | null> {
  if (!req.user) return null
  const p = await permisosDe(req)
  return { payload: req.payload, req, user: req.user as User, p, hoy: diaEnZona(new Date(), site.location.timeZone) }
}

async function enTransaccion<T>(ctx: Ctx, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
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

/** ¿El error es la base rechazando una clave de reintento repetida? Payload lo convierte en un error de validación del campo. */
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
const nombreUsuario = (u: unknown): { id: number; nombre: string } => {
  if (u && typeof u === 'object') {
    const x = u as Partial<User>
    return { id: Number(x.id), nombre: x.name?.trim() || x.email?.split('@')[0] || 'Usuario' }
  }
  return { id: Number(u) || 0, nombre: 'Usuario' }
}
const textoCorto = (s: unknown, max = 160) => String(s ?? '').trim().slice(0, max)
/** Traspasos, aportaciones y retiros: no se clasifican ni cuentan en el resultado (etapa 3). */
const INTERNOS = new Set(['traspaso', 'aportacion', 'retiro'])

async function fechaCorte(ctx: Ctx): Promise<string | null> {
  const g = await ctx.payload.findGlobal({ slug: 'fin-configuracion', depth: 0, overrideAccess: true })
  return esFechaValida(g?.fechaCorte) ? (g.fechaCorte as string) : null
}

export function permisosVista(ctx: Ctx, actividades: { id: number; nombre: string }[] = []): PermisosVista {
  const f = ctx.p.fin
  const nombres = f.alcance.map((id) => actividades.find((a) => a.id === Number(id))?.nombre).filter(Boolean)
  const alcanceTexto = ctx.p.superadmin || f.ver === 'todos'
    ? 'Todo el negocio'
    : f.ver === 'alcance'
      ? `Lo que registras y las obras o áreas: ${nombres.join(', ') || 'ninguna asignada'}`
      : 'Solo lo que tú registras'
  return {
    superadmin: ctx.p.superadmin, panel: ctx.p.panel, gestionarUsuarios: ctx.p.gestionarUsuarios,
    registrar: f.registrar, ver: f.ver, verRestringidas: f.verRestringidas, verSaldos: f.verSaldos, verUtilidad: f.verUtilidad,
    liquidar: f.liquidar, corregir: f.corregir, revisarComprobantes: f.revisarComprobantes, configurar: f.configurar, moverDinero: f.moverDinero,
    rolNombre: ctx.p.rolNombre,
    alcanceTexto: f.verRestringidas ? alcanceTexto : `${alcanceTexto}. Sin categorías restringidas.`,
  }
}

/* ───────────────────────────── visibilidad ───────────────────────────── */

async function idsRestringidas(ctx: Ctx): Promise<number[]> {
  const r = await ctx.payload.find({ collection: 'fin-categorias', where: { restringida: { equals: true } }, depth: 0, limit: 200, pagination: false, overrideAccess: true, select: { nombre: true } })
  return r.docs.map((d) => d.id)
}

/** El filtro de visibilidad va en la consulta: lo que no se puede ver, no sale de la base. */
async function filtroVisible(ctx: Ctx): Promise<Where> {
  const y: Where[] = []
  const f = ctx.p.fin
  if (!f.verRestringidas) {
    const ids = await idsRestringidas(ctx)
    if (ids.length) y.push({ or: [{ categoria: { not_in: ids } }, { categoria: { exists: false } }] })
  }
  if (!(ctx.p.superadmin || f.ver === 'todos')) {
    const propios: Where = { capturadoPor: { equals: ctx.user.id } }
    if (f.ver === 'alcance' && f.alcance.length) y.push({ or: [propios, { actividad: { in: f.alcance.map(Number) } }] })
    else y.push(propios)
  }
  return y.length ? { and: y } : {}
}

function puedeVer(ctx: Ctx, op: FinOperacion): boolean {
  const cat = typeof op.categoria === 'object' ? op.categoria : null
  if (cat?.restringida && !ctx.p.fin.verRestringidas) return false
  if (ctx.p.superadmin || ctx.p.fin.ver === 'todos') return true
  if (idDe(op.capturadoPor) === ctx.user.id) return true
  if (ctx.p.fin.ver === 'alcance') return ctx.p.fin.alcance.map(Number).includes(idDe(op.actividad) ?? -1)
  return false
}

/* ───────────────────────────── vista de una operación ───────────────────────────── */

const POPULAR = {
  'fin-categorias': { nombre: true, restringida: true, tipo: true },
  'fin-actividades': { nombre: true },
  users: { name: true, email: true },
} as const

async function armarVistas(ctx: Ctx, ops: FinOperacion[]): Promise<OperacionVista[]> {
  if (!ops.length) return []
  const ids = ops.map((o) => o.id)
  const [movs, comps, cuentas] = await Promise.all([
    ctx.payload.find({ collection: 'fin-movimientos', where: { operacion: { in: ids } }, depth: 0, pagination: false, overrideAccess: true, select: { operacion: true, cuenta: true, importe: true, anulado: true, direccion: true } }),
    ctx.payload.find({ collection: 'fin-comprobantes', where: { operacion: { in: ids } }, depth: 0, pagination: false, overrideAccess: true, select: { operacion: true, revisadoPor: true } }),
    ctx.payload.find({ collection: 'fin-cuentas', depth: 0, pagination: false, overrideAccess: true, select: { nombre: true } }),
  ])
  const nombreCuenta = new Map(cuentas.docs.map((c) => [c.id, c.nombre]))
  return ops.map((op) => {
    const mios = movs.docs.filter((m) => idDe(m.operacion) === op.id && !m.anulado)
    const total = aCentavos(op.importeTotal)
    /* Un traspaso tiene dos movimientos (sale de una cuenta, entra a otra) por
       el mismo importe: para «lo pagado» cuenta solo la salida, si no quedaría
       pagado al doble. Una aportación solo entra; un retiro solo sale. */
    const cuentan = op.tipo === 'traspaso' || op.tipo === 'retiro' ? mios.filter((m) => m.direccion === 'sale') : op.tipo === 'aportacion' ? mios.filter((m) => m.direccion === 'entra') : mios
    const pagado = cuentan.reduce((a, m) => a + aCentavos(m.importe), 0)
    const nombreDe = (m: { cuenta?: unknown } | undefined) => (m ? nombreCuenta.get(idDe(m.cuenta) ?? 0) ?? '' : '')
    const traspaso = op.tipo === 'traspaso' ? { de: nombreDe(mios.find((m) => m.direccion === 'sale')), a: nombreDe(mios.find((m) => m.direccion === 'entra')) } : null
    const { estado, pendienteCentavos } = estadoDePago(total, pagado, Boolean(op.anulada))
    const ev = comps.docs.filter((c) => idDe(c.operacion) === op.id)
    const cat = typeof op.categoria === 'object' && op.categoria ? op.categoria : null
    const act = typeof op.actividad === 'object' && op.actividad ? op.actividad : null
    return {
      id: op.id,
      folio: op.folio || `FIN-${op.id}`,
      tipo: op.tipo,
      totalCentavos: total,
      fechaReal: op.fechaReal,
      concepto: op.concepto,
      categoria: cat ? { id: cat.id, nombre: cat.nombre, restringida: Boolean(cat.restringida) } : null,
      actividad: act ? { id: act.id, nombre: act.nombre } : null,
      asignacion: op.asignacion,
      contraparte: op.contraparte || '',
      notas: op.notas || '',
      venceEl: op.venceEl || null,
      capturadoPor: nombreUsuario(op.capturadoPor),
      capturadoEn: op.createdAt,
      origen: op.origen || 'manual',
      anulada: Boolean(op.anulada),
      motivoAnulacion: op.motivoAnulacion || '',
      pagadoCentavos: pagado,
      pendienteCentavos,
      estadoPago: estado,
      clasificacion: INTERNOS.has(op.tipo) || (cat && op.asignacion !== 'pendiente') ? 'ok' : 'pendiente',
      evidencia: !ev.length ? 'pendiente' : ev.some((c) => !c.revisadoPor) ? 'por_revisar' : 'revisada',
      cuentas: [...new Set(mios.map((m) => nombreCuenta.get(idDe(m.cuenta) ?? 0) ?? ''))].filter(Boolean),
      pagadoCon: op.pagadoCon === 'propio' ? 'propio' : 'cuenta',
      reembolsoA: op.reembolsoA ? nombreUsuario(op.reembolsoA) : null,
      traspaso,
    }
  })
}

async function cargarOperacion(ctx: Ctx, id: number): Promise<FinOperacion> {
  let op: FinOperacion
  try {
    op = await ctx.payload.findByID({ collection: 'fin-operaciones', id, depth: 1, overrideAccess: true, populate: POPULAR })
  } catch {
    throw noEncontrado()
  }
  if (!op || !puedeVer(ctx, op)) throw noEncontrado()
  return op
}

/* ───────────────────────────── catálogo ───────────────────────────── */

/** Cuentas para las pantallas; las de tipo «fondo» traen a quién están a cargo (docs/62). */
async function vistasDeCuentas(ctx: Ctx, cuentas: FinCuenta[]): Promise<CuentaVista[]> {
  const ids = [...new Set(cuentas.map((c) => idDe(c.responsable)).filter((x): x is number => x != null))]
  const personas = ids.length
    ? (await ctx.payload.find({ collection: 'users', where: { id: { in: ids } }, depth: 0, pagination: false, overrideAccess: true, select: { name: true, email: true } })).docs
    : []
  return cuentas.map((c) => {
    const r = c.tipo === 'fondo' ? personas.find((u) => u.id === idDe(c.responsable)) : null
    return { id: c.id, nombre: c.nombre, tipo: c.tipo, activa: Boolean(c.activa), responsable: r ? nombreUsuario(r) : null }
  })
}

export async function catalogo(ctx: Ctx): Promise<Catalogo> {
  const [cuentas, categorias, actividades, corte, recientes] = await Promise.all([
    ctx.payload.find({ collection: 'fin-cuentas', where: { activa: { equals: true } }, depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
    ctx.payload.find({ collection: 'fin-categorias', where: { activa: { equals: true } }, depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
    ctx.payload.find({ collection: 'fin-actividades', where: { activa: { equals: true } }, depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
    fechaCorte(ctx),
    ctx.payload.find({ collection: 'fin-operaciones', where: { capturadoPor: { equals: ctx.user.id } }, depth: 0, limit: 40, sort: '-createdAt', overrideAccess: true, select: { categoria: true } }),
  ])
  const movsRecientes = recientes.docs.length
    ? await ctx.payload.find({ collection: 'fin-movimientos', where: { operacion: { in: recientes.docs.map((d) => d.id) } }, depth: 0, pagination: false, overrideAccess: true, select: { cuenta: true } })
    : { docs: [] as Pick<FinMovimiento, 'cuenta' | 'id'>[] }
  const contar = (ids: (number | null)[]) => {
    const m = new Map<number, number>()
    for (const id of ids) if (id != null) m.set(id, (m.get(id) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }
  const acts = actividades.docs.map((a) => ({ id: a.id, nombre: a.nombre, tipo: a.tipo === 'area' ? ('area' as const) : ('obra' as const) }))
  return {
    hoy: ctx.hoy,
    fechaCorte: corte,
    cuentas: await vistasDeCuentas(ctx, cuentas.docs),
    categorias: categorias.docs
      .filter((c) => !c.restringida || ctx.p.fin.verRestringidas)
      .map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, restringida: Boolean(c.restringida), actividadSugerida: idDe(c.actividadSugerida) })),
    actividades: acts,
    frecuentes: { cuentas: contar(movsRecientes.docs.map((m) => idDe(m.cuenta))).slice(0, 3), categorias: contar(recientes.docs.map((d) => idDe(d.categoria))).slice(0, 4) },
    usuario: nombreUsuario(ctx.user),
    permisos: permisosVista(ctx, acts),
  }
}

/* ───────────────────────────── registrar ───────────────────────────── */

const idEntrada = z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)])
const importeEntrada = z.union([z.number(), z.string()])

export const EsquemaRegistro = z.object({
  tipo: z.enum(['entrada', 'gasto']),
  importe: importeEntrada,
  fechaReal: z.string(),
  estado: z.enum(['realizado', 'pendiente']),
  cuenta: idEntrada.nullish(),
  medio: z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'deposito']).nullish(),
  concepto: z.string().trim().min(1, 'Escribe un concepto breve.').max(160),
  categoria: idEntrada.nullish(),
  asignacion: z.enum(['actividad', 'general', 'pendiente']),
  actividad: idEntrada.nullish(),
  contraparte: z.string().max(160).nullish(),
  notas: z.string().max(2000).nullish(),
  venceEl: z.string().nullish(),
  /* Etapa 3: gasto pagado de la bolsa de alguien (queda por reembolsar). */
  pagadoCon: z.enum(['cuenta', 'propio']).nullish(),
  reembolsoA: idEntrada.nullish(),
  /* Etapa 4: la captura nació de una nota de voz (solo para la bitácora). */
  origen: z.enum(['manual', 'voz']).nullish(),
})
export type EntradaRegistro = z.input<typeof EsquemaRegistro>

type Clasificacion = { categoria: FinCategoria | null; asignacion: FinOperacion['asignacion']; actividad: number | null }

/** Valida categoría y asignación (lo comparten registrar y clasificar). */
async function validarClasificacion(
  ctx: Ctx,
  tipo: 'entrada' | 'gasto',
  d: { categoria?: number | null; asignacion: 'actividad' | 'general' | 'pendiente'; actividad?: number | null },
): Promise<Clasificacion> {
  let categoria: FinCategoria | null = null
  if (d.categoria) {
    try {
      categoria = await ctx.payload.findByID({ collection: 'fin-categorias', id: d.categoria, depth: 0, overrideAccess: true })
    } catch {
      throw invalido('La categoría no existe.')
    }
    if (!categoria.activa) throw invalido(`La categoría «${categoria.nombre}» está desactivada.`)
    if (categoria.tipo !== tipo) throw invalido(`«${categoria.nombre}» es una categoría de ${categoria.tipo === 'entrada' ? 'entradas' : 'gastos'}.`)
    if (categoria.restringida && !ctx.p.fin.verRestringidas) throw prohibido('Esa categoría solo la registran los roles con acceso a categorías restringidas.')
  }
  let actividad: number | null = categoria ? idDe(categoria.actividadSugerida) : null
  if (d.asignacion === 'actividad') {
    if (!d.actividad) throw invalido('Elige la actividad.')
    try {
      const a = await ctx.payload.findByID({ collection: 'fin-actividades', id: d.actividad, depth: 0, overrideAccess: true })
      if (!a.activa) throw invalido(`La actividad «${a.nombre}» está desactivada.`)
      actividad = a.id
    } catch (e) {
      if (e instanceof ErrorFinanzas) throw e
      throw invalido('La actividad no existe.')
    }
  }
  return { categoria, asignacion: d.asignacion, actividad }
}

export async function registrar(ctx: Ctx, entrada: unknown, clave: string | null): Promise<{ operacion: OperacionVista; duplicado: boolean }> {
  if (!ctx.p.fin.registrar) throw prohibido('Tu rol no incluye registrar entradas y gastos.')
  if (clave) {
    const ya = await ctx.payload.find({ collection: 'fin-operaciones', where: { claveIdempotencia: { equals: clave } }, depth: 1, limit: 1, overrideAccess: true, populate: POPULAR })
    if (ya.docs[0]) return { operacion: (await armarVistas(ctx, ya.docs))[0], duplicado: true }
  }
  const parsed = EsquemaRegistro.safeParse(entrada)
  if (!parsed.success) throw invalido(parsed.error.issues[0]?.message || 'Datos incompletos.')
  const d = parsed.data
  const total = aCentavos(d.importe)
  if (!Number.isInteger(total) || total <= 0) throw invalido('Escribe un importe mayor a cero, con a lo más dos decimales.')
  const errorFecha = revisarFechaReal(d.fechaReal, ctx.hoy, await fechaCorte(ctx))
  if (errorFecha) throw invalido(errorFecha)
  if (d.venceEl && !esFechaValida(d.venceEl)) throw invalido('La fecha de vencimiento no es válida.')
  const clas = await validarClasificacion(ctx, d.tipo, d)

  const propio = d.pagadoCon === 'propio'
  let reembolsoA: number | null = null
  if (propio) {
    if (d.tipo !== 'gasto') throw invalido('«Pagado de mi bolsa» solo aplica a gastos.')
    reembolsoA = d.reembolsoA ?? ctx.user.id
    if (reembolsoA !== ctx.user.id) {
      if (ctx.p.fin.ver !== 'todos') throw prohibido('Solo quien ve todos los movimientos puede registrar un gasto pagado por otra persona.')
      try {
        await ctx.payload.findByID({ collection: 'users', id: reembolsoA, depth: 0, overrideAccess: true, select: { name: true } })
      } catch {
        throw invalido('La persona a reembolsar no existe.')
      }
    }
  }
  let cuenta: FinCuenta | null = null
  if (d.estado === 'realizado' && !propio) {
    if (!d.cuenta) throw invalido('Elige la cuenta o caja.')
    try {
      cuenta = await ctx.payload.findByID({ collection: 'fin-cuentas', id: d.cuenta, depth: 0, overrideAccess: true })
    } catch {
      throw invalido('La cuenta no existe.')
    }
    if (!cuenta.activa) throw invalido(`La cuenta «${cuenta.nombre}» está desactivada.`)
  }

  try {
    const op = await enTransaccion(ctx, async (req) => {
      const creada = await ctx.payload.create({
        collection: 'fin-operaciones',
        req,
        overrideAccess: true,
        data: {
          tipo: d.tipo,
          importeTotal: aPesos(total),
          fechaReal: d.fechaReal,
          concepto: d.concepto,
          categoria: clas.categoria?.id ?? null,
          actividad: clas.actividad,
          asignacion: clas.asignacion,
          contraparte: textoCorto(d.contraparte),
          notas: textoCorto(d.notas, 2000),
          venceEl: !propio && d.estado === 'pendiente' && d.venceEl ? d.venceEl : null,
          pagadoCon: propio ? 'propio' : 'cuenta',
          reembolsoA,
          capturadoPor: ctx.user.id,
          origen: d.origen === 'voz' ? 'voz' : 'manual',
          claveIdempotencia: clave,
        },
      })
      await ctx.payload.update({ collection: 'fin-operaciones', id: creada.id, req, overrideAccess: true, data: { folio: `FIN-${String(creada.id).padStart(6, '0')}` } })
      if (cuenta) {
        await ctx.payload.create({
          collection: 'fin-movimientos', req, overrideAccess: true,
          data: {
            operacion: creada.id, cuenta: cuenta.id, direccion: d.tipo === 'entrada' ? 'entra' : 'sale', importe: aPesos(total), fechaReal: d.fechaReal,
            medio: d.medio || (cuenta.tipo === 'banco' ? 'transferencia' : 'efectivo'), modalidad: 'contado', capturadoPor: ctx.user.id,
          },
        })
      }
      await ctx.payload.create({ collection: 'fin-bitacora', req, overrideAccess: true, data: { operacion: creada.id, accion: 'crear', usuario: ctx.user.id } })
      return creada.id
    })
    return { operacion: (await armarVistas(ctx, [await cargarOperacion(ctx, op)]))[0], duplicado: false }
  } catch (e) {
    /* Dos guardados con la misma clave al mismo tiempo: la base rechaza el
       segundo y devolvemos el primero. */
    if (clave && esDuplicado(e)) {
      const ya = await ctx.payload.find({ collection: 'fin-operaciones', where: { claveIdempotencia: { equals: clave } }, depth: 1, limit: 1, overrideAccess: true, populate: POPULAR })
      if (ya.docs[0]) return { operacion: (await armarVistas(ctx, ya.docs))[0], duplicado: true }
    }
    throw e
  }
}

/* ───────────────────────────── cobros y pagos ───────────────────────────── */

const EsquemaPago = z.object({
  importe: importeEntrada,
  cuenta: idEntrada,
  medio: z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'deposito']).nullish(),
  fechaReal: z.string(),
})

export async function liquidar(ctx: Ctx, opId: number, entrada: unknown, clave: string | null): Promise<{ duplicado: boolean }> {
  if (clave) {
    const ya = await ctx.payload.count({ collection: 'fin-movimientos', where: { claveIdempotencia: { equals: clave } }, overrideAccess: true })
    if (ya.totalDocs) return { duplicado: true }
  }
  const op = await cargarOperacion(ctx, opId)
  const propia = idDe(op.capturadoPor) === ctx.user.id
  const reembolso = op.pagadoCon === 'propio'
  /* Un reembolso lo paga el negocio: nadie se reembolsa a sí mismo por registrarlo. */
  if (reembolso ? !ctx.p.fin.liquidar : !(ctx.p.fin.liquidar || (propia && ctx.p.fin.registrar))) {
    throw prohibido(reembolso ? 'Los reembolsos los registra un rol con «Registrar cobros y pagos de cualquier pendiente».' : 'Solo quien registró la operación, o un rol con «Registrar cobros y pagos», puede hacerlo.')
  }
  if (op.anulada) throw invalido('La operación está anulada.')
  if (op.tipo !== 'entrada' && op.tipo !== 'gasto') throw invalido('Este tipo de operación se liquida desde su propio flujo.')
  const parsed = EsquemaPago.safeParse(entrada)
  if (!parsed.success) throw invalido(parsed.error.issues[0]?.message || 'Datos incompletos.')
  const d = parsed.data
  const importe = aCentavos(d.importe)
  if (!Number.isInteger(importe) || importe <= 0) throw invalido('Escribe un importe mayor a cero.')
  const errorFecha = revisarFechaReal(d.fechaReal, ctx.hoy, await fechaCorte(ctx))
  if (errorFecha) throw invalido(errorFecha)
  const [vista] = await armarVistas(ctx, [op])
  if (importe > vista.pendienteCentavos) throw invalido(`El importe (${formatoMXN(importe, true)}) es mayor que lo pendiente (${formatoMXN(vista.pendienteCentavos, true)}).`)
  let cuenta: FinCuenta
  try {
    cuenta = await ctx.payload.findByID({ collection: 'fin-cuentas', id: d.cuenta, depth: 0, overrideAccess: true })
  } catch {
    throw invalido('La cuenta no existe.')
  }
  if (!cuenta.activa) throw invalido(`La cuenta «${cuenta.nombre}» está desactivada.`)
  try {
    await enTransaccion(ctx, async (req) => {
      await ctx.payload.create({
        collection: 'fin-movimientos', req, overrideAccess: true,
        data: {
          operacion: op.id, cuenta: cuenta.id, direccion: op.tipo === 'entrada' ? 'entra' : 'sale', importe: aPesos(importe), fechaReal: d.fechaReal,
          medio: d.medio || (cuenta.tipo === 'banco' ? 'transferencia' : 'efectivo'),
          modalidad: reembolso ? 'reembolso' : importe === vista.pendienteCentavos ? 'liquidacion' : 'parcialidad', capturadoPor: ctx.user.id, claveIdempotencia: clave,
        },
      })
      await ctx.payload.create({ collection: 'fin-bitacora', req, overrideAccess: true, data: { operacion: op.id, accion: op.tipo === 'entrada' ? 'cobro' : 'pago', valorNuevo: `${reembolso ? 'Reembolso ' : ''}${formatoMXN(importe, true)}${reembolso && vista.reembolsoA ? ` a ${vista.reembolsoA.nombre}` : ''}`, usuario: ctx.user.id } })
    })
  } catch (e) {
    if (clave && esDuplicado(e)) return { duplicado: true }
    throw e
  }
  return { duplicado: false }
}

/* ───────────────────────────── detalle y listas ───────────────────────────── */

export async function detalle(ctx: Ctx, id: number): Promise<DetalleOperacion> {
  const op = await cargarOperacion(ctx, id)
  const [vista] = await armarVistas(ctx, [op])
  const [movs, comps, bit] = await Promise.all([
    ctx.payload.find({ collection: 'fin-movimientos', where: { operacion: { equals: id } }, depth: 1, pagination: false, sort: 'createdAt', overrideAccess: true, populate: { 'fin-cuentas': { nombre: true }, users: { name: true, email: true }, 'fin-operaciones': { folio: true } } }),
    ctx.payload.find({ collection: 'fin-comprobantes', where: { operacion: { equals: id } }, depth: 1, pagination: false, sort: 'createdAt', overrideAccess: true, populate: { users: { name: true, email: true }, 'fin-operaciones': { folio: true } } }),
    ctx.payload.find({ collection: 'fin-bitacora', where: { operacion: { equals: id } }, depth: 1, pagination: false, sort: 'createdAt', overrideAccess: true, populate: { users: { name: true, email: true }, 'fin-operaciones': { folio: true } } }),
  ])
  const propia = idDe(op.capturadoPor) === ctx.user.id
  const movimientos: MovimientoVista[] = movs.docs.map((m) => ({
    id: m.id,
    cuenta: { id: idDe(m.cuenta) ?? 0, nombre: typeof m.cuenta === 'object' ? (m.cuenta as FinCuenta).nombre : '' },
    direccion: m.direccion, centavos: aCentavos(m.importe), fechaReal: m.fechaReal, medio: m.medio, modalidad: m.modalidad || 'contado',
    capturadoPor: nombreUsuario(m.capturadoPor), capturadoEn: m.createdAt, anulado: Boolean(m.anulado),
  }))
  const comprobantes: ComprobanteVista[] = comps.docs.map((c) => ({
    id: c.id, nombre: c.nombreArchivo, tipoContenido: c.tipoContenido || '', subidoPor: nombreUsuario(c.subidoPor), subidoEn: c.createdAt,
    revisadoPor: c.revisadoPor ? nombreUsuario(c.revisadoPor) : null, revisadoEn: c.revisadoEn || null,
  }))
  const bitacora: BitacoraVista[] = bit.docs.map((b) => ({
    id: b.id, accion: b.accion, campo: b.campo || '', anterior: b.valorAnterior || '', nuevo: b.valorNuevo || '', motivo: b.motivo || '', usuario: nombreUsuario(b.usuario), fecha: b.createdAt,
  }))
  return {
    operacion: vista,
    movimientos,
    comprobantes,
    bitacora,
    acciones: {
      liquidar: !vista.anulada && vista.pendienteCentavos > 0 && (vista.pagadoCon === 'propio' ? ctx.p.fin.liquidar : ctx.p.fin.liquidar || (propia && ctx.p.fin.registrar)),
      adjuntar: !vista.anulada && (propia || ctx.p.fin.corregir),
      revisar: ctx.p.fin.revisarComprobantes,
      corregir: ctx.p.fin.corregir && !vista.anulada,
    },
  }
}

export type FiltrosLista = { desde?: string; hasta?: string; tipo?: string; texto?: string; estado?: string; cuenta?: number | null; actividad?: number | null }

export async function listar(ctx: Ctx, f: FiltrosLista): Promise<ListaOperaciones> {
  const hasta = esFechaValida(f.hasta) ? f.hasta : ctx.hoy
  const desde = esFechaValida(f.desde) ? f.desde : sumarDias(hasta, -30)
  const y: Where[] = [await filtroVisible(ctx), { fechaReal: { greater_than_equal: desde } }, { fechaReal: { less_than_equal: hasta } }]
  if (f.tipo === 'entrada' || f.tipo === 'gasto') y.push({ tipo: { equals: f.tipo } })
  if (f.tipo === 'internos') y.push({ tipo: { in: ['traspaso', 'aportacion', 'retiro'] } })
  const texto = textoCorto(f.texto, 60)
  if (texto) y.push({ or: [{ concepto: { like: texto } }, { folio: { like: texto } }, { contraparte: { like: texto } }] })
  if (f.actividad) y.push({ and: [{ actividad: { equals: f.actividad } }, { asignacion: { equals: 'actividad' } }] })
  if (f.cuenta) {
    const ms = await ctx.payload.find({ collection: 'fin-movimientos', where: { cuenta: { equals: f.cuenta } }, depth: 0, pagination: false, overrideAccess: true, select: { operacion: true } })
    const ids = [...new Set(ms.docs.map((m) => idDe(m.operacion)).filter((x): x is number => x != null))]
    y.push({ id: { in: ids.length ? ids : [0] } })
  }
  const LIMITE = 400
  const r = await ctx.payload.find({ collection: 'fin-operaciones', where: { and: y }, depth: 1, limit: LIMITE, sort: '-fechaReal', overrideAccess: true, populate: POPULAR })
  let filas = await armarVistas(ctx, r.docs)
  filas.sort((a, b) => (b.fechaReal + b.capturadoEn).localeCompare(a.fechaReal + a.capturadoEn))
  if (f.estado === 'pendientes') filas = filas.filter((x) => x.pendienteCentavos > 0)
  if (f.estado === 'sin_comprobante') filas = filas.filter((x) => !x.anulada && x.evidencia === 'pendiente' && !INTERNOS.has(x.tipo))
  if (f.estado === 'por_revisar') filas = filas.filter((x) => x.evidencia === 'por_revisar')
  if (f.estado === 'sin_clasificar') filas = filas.filter((x) => !x.anulada && x.clasificacion === 'pendiente')
  if (f.estado === 'anuladas') filas = filas.filter((x) => x.anulada)
  if (f.estado === 'por_reembolsar') filas = filas.filter((x) => x.pagadoCon === 'propio' && x.pendienteCentavos > 0)
  const vigentes = filas.filter((x) => !x.anulada)
  return {
    filas,
    totales: {
      entradasCentavos: vigentes.filter((x) => x.tipo === 'entrada').reduce((a, x) => a + x.totalCentavos, 0),
      gastosCentavos: vigentes.filter((x) => x.tipo === 'gasto').reduce((a, x) => a + x.totalCentavos, 0),
    },
    rango: { desde, hasta },
    alcance: permisosVista(ctx).alcanceTexto,
    truncado: r.totalDocs > LIMITE,
  }
}

export async function pendientes(ctx: Ctx): Promise<Pendientes> {
  const r = await ctx.payload.find({
    collection: 'fin-operaciones', where: { and: [await filtroVisible(ctx), { anulada: { not_equals: true } }] }, depth: 1, limit: 600, sort: '-fechaReal', overrideAccess: true, populate: POPULAR,
  })
  const filas = await armarVistas(ctx, r.docs)
  return {
    /* Un traspaso entre cuentas propias no lleva comprobante; aportaciones y retiros tampoco se exigen aquí. */
    sinComprobante: filas.filter((x) => x.evidencia === 'pendiente' && !INTERNOS.has(x.tipo)),
    porRevisar: ctx.p.fin.revisarComprobantes ? filas.filter((x) => x.evidencia === 'por_revisar') : [],
    sinClasificar: ctx.p.fin.corregir ? filas.filter((x) => x.clasificacion === 'pendiente') : [],
    porCobrarOPagar: filas.filter((x) => x.pendienteCentavos > 0 && x.pagadoCon !== 'propio'),
    porReembolsar: filas.filter((x) => x.pendienteCentavos > 0 && x.pagadoCon === 'propio'),
  }
}

export async function saldos(ctx: Ctx): Promise<Saldos> {
  if (!ctx.p.fin.verSaldos) throw prohibido('Los saldos solo los ven los roles con «Ver saldos de cuentas y cajas».')
  const [cuentas, movs] = await Promise.all([
    ctx.payload.find({ collection: 'fin-cuentas', depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
    ctx.payload.find({ collection: 'fin-movimientos', where: { anulado: { not_equals: true } }, depth: 0, pagination: false, overrideAccess: true, select: { cuenta: true, direccion: true, importe: true } }),
  ])
  const vistas = await vistasDeCuentas(ctx, cuentas.docs)
  const lista = cuentas.docs.map((c, i) => {
    const ms = movs.docs.filter((m) => idDe(m.cuenta) === c.id).map((m) => ({ direccion: m.direccion, centavos: aCentavos(m.importe) }))
    const inicial = aCentavos(c.saldoInicial ?? 0)
    return { cuenta: vistas[i], saldoInicialCentavos: inicial, saldoCentavos: saldoDeCuenta(inicial, ms) }
  })
  return { cuentas: lista, totalActivasCentavos: lista.filter((x) => x.cuenta.activa).reduce((a, x) => a + x.saldoCentavos, 0) }
}

export async function resumen(ctx: Ctx): Promise<Resumen> {
  const [p, lista, conteos] = await Promise.all([
    pendientes(ctx),
    listar(ctx, { desde: sumarDias(ctx.hoy, -60) }),
    Promise.all([
      ctx.payload.count({ collection: 'roles', overrideAccess: true }),
      ctx.payload.count({ collection: 'fin-categorias', overrideAccess: true }),
      ctx.payload.count({ collection: 'fin-cuentas', overrideAccess: true }),
      fechaCorte(ctx),
    ]),
  ])
  const total = ctx.p.fin.verSaldos ? (await saldos(ctx)).totalActivasCentavos : null
  /* Lo que le deben a quien consulta: lo ve siempre, aunque su rol no vea saldos (es su dinero). */
  const teDeben = (await ctx.payload.find({
    collection: 'fin-operaciones', where: { and: [{ pagadoCon: { equals: 'propio' } }, { reembolsoA: { equals: ctx.user.id } }, { anulada: { not_equals: true } }] }, depth: 1, limit: 200, overrideAccess: true, populate: POPULAR,
  })).docs
  const teDebenCentavos = (await armarVistas(ctx, teDeben)).reduce((a, x) => a + x.pendienteCentavos, 0)
  const f = ctx.p.superadmin || ctx.p.fin.verSaldos || ctx.p.fin.moverDinero || ctx.p.fin.liquidar ? await fondos(ctx) : null
  const mio = f ? f.fondos.find((x) => x.cuenta.responsable?.id === ctx.user.id) ?? null : await miFondo(ctx)
  return {
    conteos: { sinComprobante: p.sinComprobante.length, porRevisar: p.porRevisar.length, sinClasificar: p.sinClasificar.length, porCobrarOPagar: p.porCobrarOPagar.length, porReembolsar: p.porReembolsar.length },
    ultimos: lista.filas.slice(0, 6),
    saldoTotalCentavos: total,
    configurado: { roles: conteos[0].totalDocs > 0, catalogos: conteos[1].totalDocs > 0, cuentas: conteos[2].totalDocs > 0, fechaCorte: Boolean(conteos[3]) },
    teDebenCentavos,
    porReembolsarCentavos: ctx.p.fin.liquidar ? p.porReembolsar.reduce((a, x) => a + x.pendienteCentavos, 0) : null,
    miFondo: mio ? { cuenta: mio.cuenta, saldoCentavos: mio.saldoCentavos } : null,
    fondosEnManosCentavos: f ? f.totalEnManosCentavos : null,
  }
}

/* ───────────────────────────── ELGO: resultado por obra ───────────────────────────── */

/**
 * Cuánto ha entrado y salido por cada obra (y por cada área de soporte), con
 * lo cobrado, lo pagado y lo pendiente. Respeta el alcance del rol igual que
 * las listas: lo que no se puede ver no se suma. Sin fecha «desde» toma todo
 * lo registrado (las obras duran meses; el corte por mes engaña).
 */
export async function obras(ctx: Ctx, f: { desde?: string; hasta?: string; estado?: string }): Promise<ResultadoObras> {
  if (!ctx.p.fin.verUtilidad) throw prohibido('El resultado por obra solo lo ven los roles con «Ver resultado por obra».')
  const hasta = esFechaValida(f.hasta) ? f.hasta : ctx.hoy
  const desde = esFechaValida(f.desde) ? f.desde : null
  const y: Where[] = [await filtroVisible(ctx), { tipo: { in: ['entrada', 'gasto'] } }, { anulada: { not_equals: true } }, { fechaReal: { less_than_equal: hasta } }]
  if (desde) y.push({ fechaReal: { greater_than_equal: desde } })
  const [acts, r] = await Promise.all([
    ctx.payload.find({ collection: 'fin-actividades', depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' }),
    ctx.payload.find({ collection: 'fin-operaciones', where: { and: y }, depth: 1, pagination: false, overrideAccess: true, populate: POPULAR }),
  ])
  const vistas = await armarVistas(ctx, r.docs)
  const vacia = (base: Pick<FilaObra, 'id' | 'nombre' | 'tipo' | 'clave' | 'cliente' | 'sector' | 'activa' | 'contratadoCentavos'>): FilaObra => ({
    ...base, entradasCentavos: 0, cobradoCentavos: 0, porCobrarCentavos: 0, gastosCentavos: 0, pagadoCentavos: 0, porPagarCentavos: 0,
    resultadoCentavos: 0, flujoCentavos: 0, operaciones: 0, ultimo: null,
  })
  const filas = new Map<string, FilaObra>()
  for (const a of acts.docs) {
    filas.set(`a${a.id}`, vacia({
      id: a.id, nombre: a.nombre, tipo: a.tipo === 'area' ? 'area' : 'obra', clave: a.clave || '', cliente: a.cliente || '',
      sector: a.sector === 'publico' || a.sector === 'privado' ? a.sector : null, activa: Boolean(a.activa),
      contratadoCentavos: a.importeContratado != null ? aCentavos(a.importeContratado) : null,
    }))
  }
  filas.set('general', vacia({ id: null, nombre: 'General (de toda la empresa)', tipo: 'general', clave: '', cliente: '', sector: null, activa: true, contratadoCentavos: null }))
  filas.set('pendiente', vacia({ id: null, nombre: 'Sin asignar todavía', tipo: 'pendiente', clave: '', cliente: '', sector: null, activa: true, contratadoCentavos: null }))
  for (const op of vistas) {
    const k = op.asignacion === 'actividad' && op.actividad ? `a${op.actividad.id}` : op.asignacion === 'general' ? 'general' : 'pendiente'
    const fila = filas.get(k) ?? filas.get('pendiente')!
    fila.operaciones += 1
    if (!fila.ultimo || op.fechaReal > fila.ultimo) fila.ultimo = op.fechaReal
    if (op.tipo === 'entrada') {
      fila.entradasCentavos += op.totalCentavos
      fila.cobradoCentavos += op.pagadoCentavos
      fila.porCobrarCentavos += op.pendienteCentavos
    } else {
      fila.gastosCentavos += op.totalCentavos
      fila.pagadoCentavos += op.pagadoCentavos
      fila.porPagarCentavos += op.pendienteCentavos
    }
  }
  for (const x of filas.values()) {
    x.resultadoCentavos = x.entradasCentavos - x.gastosCentavos
    x.flujoCentavos = x.cobradoCentavos - x.pagadoCentavos
  }
  const orden = { obra: 0, area: 1, general: 2, pendiente: 3 } as const
  const lista = [...filas.values()]
    .filter((x) => {
      if (x.tipo === 'obra') return f.estado === 'terminadas' ? !x.activa : f.estado === 'todas' ? true : x.activa || x.operaciones > 0
      return x.operaciones > 0
    })
    .sort((a, b) => orden[a.tipo] - orden[b.tipo] || Number(b.activa) - Number(a.activa) || a.nombre.localeCompare(b.nombre, 'es'))
  const suma = (k: keyof FilaObra) => lista.reduce((acc, x) => acc + (Number(x[k]) || 0), 0)
  const contratos = lista.filter((x) => x.contratadoCentavos != null)
  return {
    filas: lista,
    totales: {
      contratadoCentavos: contratos.length ? contratos.reduce((acc, x) => acc + (x.contratadoCentavos ?? 0), 0) : null,
      entradasCentavos: suma('entradasCentavos'), cobradoCentavos: suma('cobradoCentavos'), porCobrarCentavos: suma('porCobrarCentavos'),
      gastosCentavos: suma('gastosCentavos'), pagadoCentavos: suma('pagadoCentavos'), porPagarCentavos: suma('porPagarCentavos'),
      resultadoCentavos: suma('resultadoCentavos'), flujoCentavos: suma('flujoCentavos'), operaciones: suma('operaciones'),
    },
    rango: { desde, hasta },
    incluyeRestringidas: ctx.p.fin.verRestringidas,
  }
}

/* ───────────────────────────── etapa 3: fondos y dinero interno (docs/62) ───────────────────────────── */

/**
 * Las cuentas de tipo «fondo» son dinero a cargo de una persona. Entregarle
 * dinero es un traspaso hacia su fondo; lo que gasta se registra como gasto
 * pagado desde ese fondo; lo que devuelve es un traspaso de regreso. Aquí se
 * arma el estado de cada fondo a partir de sus movimientos.
 */
async function armarFondos(ctx: Ctx, cuentas: FinCuenta[]): Promise<Fondos> {
  const vistas = await vistasDeCuentas(ctx, cuentas)
  const ids = cuentas.map((c) => c.id)
  const movs = ids.length
    ? (await ctx.payload.find({ collection: 'fin-movimientos', where: { and: [{ cuenta: { in: ids } }, { anulado: { not_equals: true } }] }, depth: 0, pagination: false, overrideAccess: true, select: { cuenta: true, direccion: true, importe: true, modalidad: true, fechaReal: true } })).docs
    : []
  const lista = cuentas.map((c, i) => {
    const r = resumenDeFondo(aCentavos(c.saldoInicial ?? 0), movs.filter((m) => idDe(m.cuenta) === c.id).map((m) => ({ direccion: m.direccion, centavos: aCentavos(m.importe), modalidad: m.modalidad, fechaReal: m.fechaReal })))
    return { cuenta: vistas[i], ...r }
  })
  return { fondos: lista, totalEnManosCentavos: lista.filter((x) => x.cuenta.activa).reduce((a, x) => a + x.saldoCentavos, 0) }
}

export async function fondos(ctx: Ctx): Promise<Fondos> {
  if (!(ctx.p.superadmin || ctx.p.fin.verSaldos || ctx.p.fin.moverDinero || ctx.p.fin.liquidar)) throw prohibido('Los fondos los ven los roles que mueven dinero, ven saldos o registran pagos.')
  const r = await ctx.payload.find({ collection: 'fin-cuentas', where: { tipo: { equals: 'fondo' } }, depth: 0, pagination: false, overrideAccess: true, sort: 'nombre' })
  return armarFondos(ctx, r.docs)
}

/** El fondo a cargo de quien consulta (si tiene uno): su propio dinero en custodia, visible aunque no vea saldos. */
async function miFondo(ctx: Ctx) {
  const r = await ctx.payload.find({ collection: 'fin-cuentas', where: { and: [{ tipo: { equals: 'fondo' } }, { responsable: { equals: ctx.user.id } }, { activa: { equals: true } }] }, depth: 0, limit: 1, overrideAccess: true })
  if (!r.docs[0]) return null
  return (await armarFondos(ctx, r.docs)).fondos[0] ?? null
}

/** Las personas del panel, solo id y nombre: para decir quién pagó de su bolsa (docs/62). */
export async function equipo(ctx: Ctx): Promise<PersonaBreve[]> {
  if (!(ctx.p.superadmin || ctx.p.fin.ver === 'todos')) throw prohibido()
  const r = await ctx.payload.find({ collection: 'users', depth: 0, pagination: false, overrideAccess: true, sort: 'name', select: { name: true, email: true } })
  return r.docs.map((u) => nombreUsuario(u))
}

const EsquemaMover = z.object({
  tipo: z.enum(['traspaso', 'aportacion', 'retiro']),
  importe: importeEntrada,
  fechaReal: z.string(),
  de: idEntrada.nullish(),
  a: idEntrada.nullish(),
  medio: z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'deposito']).nullish(),
  concepto: z.string().trim().max(160).nullish(),
  contraparte: z.string().max(160).nullish(),
  notas: z.string().max(2000).nullish(),
})

/**
 * Traspaso entre cuentas (incluye entregar dinero a un fondo y recibir su
 * devolución), aportación de socio (entra dinero que no es venta) y retiro de
 * socio (sale dinero que no es gasto). Ninguno cuenta en el resultado; todos
 * mueven saldos. Un traspaso es UNA operación con DOS movimientos.
 */
export async function moverDinero(ctx: Ctx, entrada: unknown, clave: string | null): Promise<{ operacion: OperacionVista; duplicado: boolean }> {
  if (!ctx.p.fin.moverDinero) throw prohibido('Tu rol no incluye mover dinero entre cuentas.')
  if (clave) {
    const ya = await ctx.payload.find({ collection: 'fin-operaciones', where: { claveIdempotencia: { equals: clave } }, depth: 1, limit: 1, overrideAccess: true, populate: POPULAR })
    if (ya.docs[0]) return { operacion: (await armarVistas(ctx, ya.docs))[0], duplicado: true }
  }
  const parsed = EsquemaMover.safeParse(entrada)
  if (!parsed.success) throw invalido(parsed.error.issues[0]?.message || 'Datos incompletos.')
  const d = parsed.data
  const total = aCentavos(d.importe)
  if (!Number.isInteger(total) || total <= 0) throw invalido('Escribe un importe mayor a cero, con a lo más dos decimales.')
  const errorFecha = revisarFechaReal(d.fechaReal, ctx.hoy, await fechaCorte(ctx))
  if (errorFecha) throw invalido(errorFecha)
  const cargarCuenta = async (id: number | null | undefined, que: string): Promise<FinCuenta> => {
    if (!id) throw invalido(`Elige ${que}.`)
    let c: FinCuenta
    try {
      c = await ctx.payload.findByID({ collection: 'fin-cuentas', id, depth: 0, overrideAccess: true })
    } catch {
      throw invalido('La cuenta no existe.')
    }
    if (!c.activa) throw invalido(`La cuenta «${c.nombre}» está desactivada.`)
    return c
  }
  const de = d.tipo === 'aportacion' ? null : await cargarCuenta(d.de, 'de qué cuenta sale')
  const a = d.tipo === 'retiro' ? null : await cargarCuenta(d.a, 'a qué cuenta entra')
  if (de && a && de.id === a.id) throw invalido('La cuenta de salida y la de entrada tienen que ser distintas.')
  const contraparte = textoCorto(d.contraparte)
  if ((d.tipo === 'aportacion' || d.tipo === 'retiro') && !contraparte) throw invalido('Escribe el nombre del socio.')
  const concepto = textoCorto(d.concepto) || conceptoInterno(d.tipo, de?.nombre ?? null, a?.nombre ?? null, contraparte || null)
  const medio = d.medio || ((de ?? a)?.tipo === 'banco' ? 'transferencia' : 'efectivo')
  try {
    const id = await enTransaccion(ctx, async (req) => {
      const creada = await ctx.payload.create({
        collection: 'fin-operaciones', req, overrideAccess: true,
        data: {
          tipo: d.tipo, importeTotal: aPesos(total), fechaReal: d.fechaReal, concepto, categoria: null, actividad: null, asignacion: 'no_aplica',
          contraparte, notas: textoCorto(d.notas, 2000), pagadoCon: 'cuenta', capturadoPor: ctx.user.id, origen: 'manual', claveIdempotencia: clave,
        },
      })
      await ctx.payload.update({ collection: 'fin-operaciones', id: creada.id, req, overrideAccess: true, data: { folio: `FIN-${String(creada.id).padStart(6, '0')}` } })
      const modalidad = d.tipo === 'traspaso' ? 'traspaso' : 'contado'
      if (de) {
        await ctx.payload.create({ collection: 'fin-movimientos', req, overrideAccess: true, data: { operacion: creada.id, cuenta: de.id, direccion: 'sale', importe: aPesos(total), fechaReal: d.fechaReal, medio, modalidad, capturadoPor: ctx.user.id } })
      }
      if (a) {
        await ctx.payload.create({ collection: 'fin-movimientos', req, overrideAccess: true, data: { operacion: creada.id, cuenta: a.id, direccion: 'entra', importe: aPesos(total), fechaReal: d.fechaReal, medio, modalidad, capturadoPor: ctx.user.id } })
      }
      await ctx.payload.create({ collection: 'fin-bitacora', req, overrideAccess: true, data: { operacion: creada.id, accion: 'crear', valorNuevo: d.tipo === 'traspaso' ? `${de?.nombre} → ${a?.nombre}` : contraparte, usuario: ctx.user.id } })
      return creada.id
    })
    return { operacion: (await armarVistas(ctx, [await cargarOperacion(ctx, id)]))[0], duplicado: false }
  } catch (e) {
    if (clave && esDuplicado(e)) {
      const ya = await ctx.payload.find({ collection: 'fin-operaciones', where: { claveIdempotencia: { equals: clave } }, depth: 1, limit: 1, overrideAccess: true, populate: POPULAR })
      if (ya.docs[0]) return { operacion: (await armarVistas(ctx, ya.docs))[0], duplicado: true }
    }
    throw e
  }
}

/* ───────────────────────────── comprobantes (privados) ───────────────────────────── */

const MAX_BYTES = 10 * 1024 * 1024
const TIPOS_OK = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i

function tokenPrivado(): string {
  const t = process.env.FINANZAS_BLOB_READ_WRITE_TOKEN?.trim()
  if (!t) {
    /* No se guarda en ningún otro lado «mientras tanto»: un comprobante en un
       almacén público sería una fuga. Mejor un error claro. */
    throw new ErrorFinanzas(503, 'Falta configurar el almacén privado de comprobantes (FINANZAS_BLOB_READ_WRITE_TOKEN). El movimiento sigue registrado; el comprobante se podrá subir después.')
  }
  return t
}

export async function adjuntarComprobante(ctx: Ctx, opId: number, archivo: File, clave: string | null): Promise<{ duplicado: boolean }> {
  if (clave) {
    const ya = await ctx.payload.count({ collection: 'fin-comprobantes', where: { claveIdempotencia: { equals: clave } }, overrideAccess: true })
    if (ya.totalDocs) return { duplicado: true }
  }
  const op = await cargarOperacion(ctx, opId)
  const propia = idDe(op.capturadoPor) === ctx.user.id
  if (!(propia || ctx.p.fin.corregir)) throw prohibido('Solo quien registró el movimiento puede subir su comprobante.')
  if (op.anulada) throw invalido('La operación está anulada.')
  if (!archivo || typeof archivo.arrayBuffer !== 'function') throw invalido('Elige un archivo o toma una foto.')
  if (archivo.size > MAX_BYTES) throw invalido('El archivo pesa más de 10 MB. Toma la foto con menor resolución o sube un PDF más ligero.')
  const tipo = archivo.type || 'application/octet-stream'
  if (!TIPOS_OK.test(tipo)) throw invalido('Solo se aceptan fotos (JPG, PNG, WEBP, HEIC) o PDF.')
  const token = tokenPrivado()
  const limpio = (archivo.name || 'comprobante').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)
  const subido = await blobPut(`finanzas/comprobantes/${op.id}/${limpio}`, archivo, { access: 'private', token, addRandomSuffix: true, contentType: tipo })
  try {
    await enTransaccion(ctx, async (req) => {
      await ctx.payload.create({
        collection: 'fin-comprobantes', req, overrideAccess: true,
        data: { operacion: op.id, ruta: subido.pathname, nombreArchivo: archivo.name || limpio, tipoContenido: tipo, tamano: archivo.size, subidoPor: ctx.user.id, claveIdempotencia: clave },
      })
      await ctx.payload.create({ collection: 'fin-bitacora', req, overrideAccess: true, data: { operacion: op.id, accion: 'comprobante', valorNuevo: archivo.name || limpio, usuario: ctx.user.id } })
    })
  } catch (e) {
    if (clave && esDuplicado(e)) return { duplicado: true }
    throw e
  }
  return { duplicado: false }
}

/** Entrega el archivo SOLO si la persona puede ver la operación a la que pertenece. */
export async function abrirComprobante(ctx: Ctx, id: number): Promise<Response> {
  let c: FinComprobante
  try {
    c = await ctx.payload.findByID({ collection: 'fin-comprobantes', id, depth: 0, overrideAccess: true })
  } catch {
    throw noEncontrado('No encontramos ese comprobante.')
  }
  await cargarOperacion(ctx, Number(idDe(c.operacion))) // lanza 404 si no la puede ver
  const r = await blobGet(c.ruta, { access: 'private', token: tokenPrivado() })
  if (!r || r.statusCode !== 200 || !r.stream) throw noEncontrado('El archivo ya no está en el almacén.')
  return new Response(r.stream, {
    headers: {
      'Content-Type': r.blob.contentType || c.tipoContenido || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(c.nombreArchivo)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function revisarComprobante(ctx: Ctx, id: number): Promise<void> {
  if (!ctx.p.fin.revisarComprobantes) throw prohibido('La revisión de comprobantes la hacen los roles con «Revisar comprobantes».')
  let c: FinComprobante
  try {
    c = await ctx.payload.findByID({ collection: 'fin-comprobantes', id, depth: 0, overrideAccess: true })
  } catch {
    throw noEncontrado('No encontramos ese comprobante.')
  }
  await cargarOperacion(ctx, Number(idDe(c.operacion)))
  if (c.revisadoPor) return
  await enTransaccion(ctx, async (req) => {
    await ctx.payload.update({ collection: 'fin-comprobantes', id, req, overrideAccess: true, data: { revisadoPor: ctx.user.id, revisadoEn: new Date().toISOString() } })
    await ctx.payload.create({ collection: 'fin-bitacora', req, overrideAccess: true, data: { operacion: idDe(c.operacion), accion: 'revision', valorNuevo: c.nombreArchivo, usuario: ctx.user.id } })
  })
}

/* ───────────────────────────── correcciones ───────────────────────────── */

const EsquemaCorreccion = z.object({
  motivo: z.string().trim().min(5, 'Escribe el motivo (mínimo 5 caracteres).').max(300),
  importe: importeEntrada.optional(),
  fechaReal: z.string().optional(),
  concepto: z.string().trim().min(1).max(160).optional(),
  contraparte: z.string().max(160).optional(),
  categoria: idEntrada.nullish(),
  cuenta: idEntrada.optional(),
})

export async function corregir(ctx: Ctx, id: number, entrada: unknown): Promise<void> {
  if (!ctx.p.fin.corregir) throw prohibido('Solo los roles con «Corregir, clasificar y anular» pueden corregir registros.')
  const parsed = EsquemaCorreccion.safeParse(entrada)
  if (!parsed.success) throw invalido(parsed.error.issues[0]?.message || 'Datos incompletos.')
  const d = parsed.data
  const op = await cargarOperacion(ctx, id)
  if (op.anulada) throw invalido('No se puede corregir una operación anulada.')
  if (op.tipo !== 'entrada' && op.tipo !== 'gasto') throw invalido('Este tipo de operación se corrige desde su propio flujo.')
  const movs = (await ctx.payload.find({ collection: 'fin-movimientos', where: { and: [{ operacion: { equals: id } }, { anulado: { not_equals: true } }] }, depth: 1, pagination: false, overrideAccess: true, populate: { 'fin-cuentas': { nombre: true }, 'fin-operaciones': { folio: true }, users: { name: true } } })).docs
  const cambios: { campo: string; antes: string; despues: string }[] = []
  const dataOp: Partial<FinOperacion> = {}
  const dataMov: Partial<FinMovimiento> = {}

  if (d.importe !== undefined) {
    const nuevo = aCentavos(d.importe)
    const actual = aCentavos(op.importeTotal)
    if (!Number.isInteger(nuevo) || nuevo <= 0 || !tieneDosDecimalesOMenos(aPesos(nuevo))) throw invalido('El importe no es válido.')
    if (nuevo !== actual) {
      if (movs.length > 1) throw invalido('Tiene varios cobros o pagos: anula y vuelve a registrar, o corrige con un ajuste en la etapa 3.')
      dataOp.importeTotal = aPesos(nuevo)
      if (movs.length === 1) dataMov.importe = aPesos(nuevo)
      cambios.push({ campo: 'Importe', antes: formatoMXN(actual, true), despues: formatoMXN(nuevo, true) })
    }
  }
  if (d.fechaReal !== undefined && d.fechaReal !== op.fechaReal) {
    const err = revisarFechaReal(d.fechaReal, ctx.hoy, await fechaCorte(ctx))
    if (err) throw invalido(err)
    dataOp.fechaReal = d.fechaReal
    if (movs.length === 1 && movs[0].fechaReal === op.fechaReal) dataMov.fechaReal = d.fechaReal
    cambios.push({ campo: 'Fecha real', antes: op.fechaReal, despues: d.fechaReal })
  }
  if (d.concepto !== undefined && d.concepto !== op.concepto) {
    dataOp.concepto = d.concepto
    cambios.push({ campo: 'Concepto', antes: op.concepto, despues: d.concepto })
  }
  if (d.contraparte !== undefined && textoCorto(d.contraparte) !== (op.contraparte || '')) {
    dataOp.contraparte = textoCorto(d.contraparte)
    cambios.push({ campo: 'Contraparte', antes: op.contraparte || '—', despues: textoCorto(d.contraparte) || '—' })
  }
  if (d.categoria !== undefined && (d.categoria ?? null) !== idDe(op.categoria)) {
    const actualNombre = typeof op.categoria === 'object' && op.categoria ? op.categoria.nombre : 'Sin clasificar'
    let nueva: FinCategoria | null = null
    if (d.categoria) {
      const clas = await validarClasificacion(ctx, op.tipo, {
        categoria: d.categoria,
        asignacion: op.asignacion === 'no_aplica' ? 'pendiente' : op.asignacion,
        actividad: idDe(op.actividad),
      })
      nueva = clas.categoria
    }
    dataOp.categoria = nueva?.id ?? null
    cambios.push({ campo: 'Categoría', antes: actualNombre, despues: nueva?.nombre ?? 'Sin clasificar' })
  }
  if (d.cuenta !== undefined) {
    if (movs.length !== 1) throw invalido('Solo se puede cambiar la cuenta de una operación con un solo cobro o pago.')
    if (d.cuenta !== idDe(movs[0].cuenta)) {
      let c: FinCuenta
      try {
        c = await ctx.payload.findByID({ collection: 'fin-cuentas', id: d.cuenta, depth: 0, overrideAccess: true })
      } catch {
        throw invalido('La cuenta no existe.')
      }
      if (!c.activa) throw invalido(`La cuenta «${c.nombre}» está desactivada.`)
      dataMov.cuenta = c.id
      cambios.push({ campo: 'Cuenta', antes: typeof movs[0].cuenta === 'object' ? (movs[0].cuenta as FinCuenta).nombre : '', despues: c.nombre })
    }
  }
  if (!cambios.length) throw invalido('No hay cambios que guardar.')
  await enTransaccion(ctx, async (req) => {
    if (Object.keys(dataOp).length) await ctx.payload.update({ collection: 'fin-operaciones', id, req, overrideAccess: true, data: dataOp })
    if (Object.keys(dataMov).length && movs[0]) await ctx.payload.update({ collection: 'fin-movimientos', id: movs[0].id, req, overrideAccess: true, data: dataMov })
    for (const c of cambios) {
      await ctx.payload.create({ collection: 'fin-bitacora', req, overrideAccess: true, data: { operacion: id, accion: 'corregir', campo: c.campo, valorAnterior: c.antes, valorNuevo: c.despues, motivo: d.motivo, usuario: ctx.user.id } })
    }
  })
}

const EsquemaClasificacion = z.object({
  categoria: idEntrada,
  asignacion: z.enum(['actividad', 'general']),
  actividad: idEntrada.nullish(),
})

export async function clasificar(ctx: Ctx, id: number, entrada: unknown): Promise<void> {
  if (!ctx.p.fin.corregir) throw prohibido('La clasificación la hacen los roles con «Corregir, clasificar y anular».')
  const parsed = EsquemaClasificacion.safeParse(entrada)
  if (!parsed.success) throw invalido(parsed.error.issues[0]?.message || 'Elige categoría y asignación.')
  const op = await cargarOperacion(ctx, id)
  if (op.anulada) throw invalido('La operación está anulada.')
  if (op.tipo !== 'entrada' && op.tipo !== 'gasto') throw invalido('Este tipo de operación no se clasifica aquí.')
  const clas = await validarClasificacion(ctx, op.tipo, parsed.data)
  const antes = typeof op.categoria === 'object' && op.categoria ? op.categoria.nombre : 'Sin clasificar'
  await enTransaccion(ctx, async (req) => {
    await ctx.payload.update({
      collection: 'fin-operaciones', id, req, overrideAccess: true,
      data: { categoria: clas.categoria?.id ?? null, asignacion: clas.asignacion, actividad: clas.actividad },
    })
    await ctx.payload.create({ collection: 'fin-bitacora', req, overrideAccess: true, data: { operacion: id, accion: 'clasificar', campo: 'Clasificación', valorAnterior: antes, valorNuevo: clas.categoria?.nombre ?? '', usuario: ctx.user.id } })
  })
}

export async function anular(ctx: Ctx, id: number, entrada: unknown): Promise<void> {
  if (!ctx.p.fin.corregir) throw prohibido('Solo los roles con «Corregir, clasificar y anular» pueden anular.')
  const motivo = z.object({ motivo: z.string().trim().min(5, 'Escribe el motivo de la anulación (mínimo 5 caracteres).').max(300) }).safeParse(entrada)
  if (!motivo.success) throw invalido(motivo.error.issues[0]?.message || 'Escribe el motivo.')
  const op = await cargarOperacion(ctx, id)
  if (op.anulada) return
  await enTransaccion(ctx, async (req) => {
    await ctx.payload.update({ collection: 'fin-operaciones', id, req, overrideAccess: true, data: { anulada: true, motivoAnulacion: motivo.data.motivo, anuladaPor: ctx.user.id, anuladaEn: new Date().toISOString() } })
    await ctx.payload.update({ collection: 'fin-movimientos', where: { operacion: { equals: id } }, req, overrideAccess: true, data: { anulado: true } })
    await ctx.payload.create({ collection: 'fin-bitacora', req, overrideAccess: true, data: { operacion: id, accion: 'anular', motivo: motivo.data.motivo, usuario: ctx.user.id } })
  })
}

/* ───────────────────────────── arranque ───────────────────────────── */

/**
 * Catálogo sugerido para una constructora eléctrica con obra pública y
 * privada (ELGO). Es solo un punto de partida: se crea con un botón en
 * Finanzas → Configuración y después se edita en el panel (Finanzas → Obras y
 * áreas / Categorías). Las obras NO se sugieren: se dan de alta una por una.
 *
 * Los conceptos de obra no llevan área sugerida a propósito: al registrarlos
 * se elige la obra. Los de soporte sugieren su área.
 */
const OFICINA = 'Oficina y administración'
const CONCURSOS = 'Concursos y licitaciones'
const MAQUINARIA = 'Maquinaria, vehículos y almacén'
const ACTIVIDADES_SUGERIDAS = [OFICINA, CONCURSOS, MAQUINARIA]
const CATEGORIAS_SUGERIDAS: { nombre: string; tipo: 'entrada' | 'gasto'; actividad?: string; restringida?: boolean }[] = [
  /* Entradas */
  { nombre: 'Anticipo de obra', tipo: 'entrada' },
  { nombre: 'Estimación cobrada', tipo: 'entrada' },
  { nombre: 'Finiquito de obra', tipo: 'entrada' },
  { nombre: 'Cobro de obra privada', tipo: 'entrada' },
  { nombre: 'Devolución de retenciones o fondo de garantía', tipo: 'entrada' },
  { nombre: 'Venta de material sobrante o chatarra', tipo: 'entrada', actividad: MAQUINARIA },
  { nombre: 'Otras entradas', tipo: 'entrada', actividad: OFICINA },
  /* Gastos de obra (se elige la obra al registrar) */
  { nombre: 'Material eléctrico', tipo: 'gasto' },
  { nombre: 'Material de obra civil', tipo: 'gasto' },
  { nombre: 'Subcontratos', tipo: 'gasto' },
  { nombre: 'Raya y destajos de obra', tipo: 'gasto' },
  { nombre: 'Renta de maquinaria y equipo', tipo: 'gasto' },
  { nombre: 'Combustibles y lubricantes', tipo: 'gasto' },
  { nombre: 'Fletes y acarreos', tipo: 'gasto' },
  { nombre: 'Herramienta menor y consumibles', tipo: 'gasto' },
  { nombre: 'Equipo de protección y seguridad', tipo: 'gasto' },
  { nombre: 'Viáticos (hospedaje, alimentos, casetas)', tipo: 'gasto' },
  { nombre: 'Trámites, pruebas y dictámenes', tipo: 'gasto' },
  { nombre: 'Fianzas y seguros de obra', tipo: 'gasto' },
  /* Gastos de soporte */
  { nombre: 'Bases de licitación y gastos de concurso', tipo: 'gasto', actividad: CONCURSOS },
  { nombre: 'Mantenimiento de maquinaria y vehículos', tipo: 'gasto', actividad: MAQUINARIA },
  { nombre: 'Nómina administrativa', tipo: 'gasto', actividad: OFICINA, restringida: true },
  { nombre: 'Renta de oficina y bodega', tipo: 'gasto', actividad: OFICINA },
  { nombre: 'Servicios (luz, agua, teléfono, internet)', tipo: 'gasto', actividad: OFICINA },
  { nombre: 'Contabilidad y honorarios profesionales', tipo: 'gasto', actividad: OFICINA },
  { nombre: 'Impuestos y derechos', tipo: 'gasto', actividad: OFICINA },
  { nombre: 'Comisiones bancarias', tipo: 'gasto', actividad: OFICINA },
  { nombre: 'Papelería y gastos de oficina', tipo: 'gasto', actividad: OFICINA },
  { nombre: 'Otros gastos', tipo: 'gasto', actividad: OFICINA },
]

type RolSugerido = { nombre: string; descripcion: string; panel: { acceso: boolean; gestionarUsuarios: boolean }; finanzas: Record<string, boolean | string | number[]> }
function rolesSugeridos(): RolSugerido[] {
  const todo = { registrar: true, ver: 'todos', verRestringidas: true, verSaldos: true, verUtilidad: true, liquidar: true, corregir: true, revisarComprobantes: true, configurar: true, moverDinero: true }
  return [
    { nombre: 'Dueño', descripcion: 'Acceso completo y administración de usuarios y roles', panel: { acceso: true, gestionarUsuarios: true }, finanzas: { ...todo } },
    { nombre: 'Administración', descripcion: 'Finanzas completas, sin administrar usuarios', panel: { acceso: true, gestionarUsuarios: false }, finanzas: { ...todo } },
    {
      nombre: 'Compras',
      descripcion: 'Registra y paga compras de todas las obras; revisa comprobantes. Sin nómina, sin saldos ni resultados',
      panel: { acceso: false, gestionarUsuarios: false },
      finanzas: { registrar: true, ver: 'todos', liquidar: true, revisarComprobantes: true },
    },
    {
      nombre: 'Residente de obra',
      descripcion: 'Solo registra gastos y entradas desde el celular y ve lo suyo. Para que vea una obra completa, duplica el rol y elige la obra en «Obras y áreas de su alcance»',
      panel: { acceso: false, gestionarUsuarios: false },
      finanzas: { registrar: true, ver: 'propios' },
    },
  ]
}

export async function arranque(ctx: Ctx, entrada: unknown): Promise<{ hecho: string[] }> {
  const d = z.object({ que: z.enum(['catalogos', 'roles', 'corte']), fechaCorte: z.string().optional() }).safeParse(entrada)
  if (!d.success) throw invalido('Petición no válida.')
  const hecho: string[] = []
  if (d.data.que === 'catalogos') {
    if (!ctx.p.fin.configurar) throw prohibido()
    const ya = await ctx.payload.count({ collection: 'fin-categorias', overrideAccess: true })
    if (ya.totalDocs) throw invalido('Ya hay categorías. Edítalas en Finanzas → Categorías del panel.')
    await enTransaccion(ctx, async (req) => {
      const ids = new Map<string, number>()
      const existentes = await ctx.payload.find({ collection: 'fin-actividades', depth: 0, pagination: false, overrideAccess: true, req })
      for (const a of existentes.docs) ids.set(a.nombre, a.id)
      for (const nombre of ACTIVIDADES_SUGERIDAS) {
        if (!ids.has(nombre)) ids.set(nombre, (await ctx.payload.create({ collection: 'fin-actividades', req, overrideAccess: true, data: { nombre, tipo: 'area', activa: true } })).id)
      }
      for (const c of CATEGORIAS_SUGERIDAS) {
        await ctx.payload.create({
          collection: 'fin-categorias', req, overrideAccess: true,
          data: { nombre: c.nombre, tipo: c.tipo, restringida: Boolean(c.restringida), actividadSugerida: c.actividad ? ids.get(c.actividad) ?? null : null, activa: true },
        })
      }
    })
    hecho.push(`${ACTIVIDADES_SUGERIDAS.length} áreas de soporte y ${CATEGORIAS_SUGERIDAS.length} categorías`)
  }
  if (d.data.que === 'roles') {
    if (!ctx.p.gestionarUsuarios) throw prohibido('Los roles los crean los dueños o el superadministrador.')
    const ya = await ctx.payload.count({ collection: 'roles', overrideAccess: true })
    if (ya.totalDocs) throw invalido('Ya hay roles. Edítalos en Sistema → Roles.')
    const lista = rolesSugeridos()
    await enTransaccion(ctx, async (req) => {
      for (const r of lista) {
        await ctx.payload.create({ collection: 'roles', req, overrideAccess: true, data: r as never })
      }
    })
    hecho.push(`${lista.length} roles sugeridos`)
  }
  if (d.data.que === 'corte') {
    if (!ctx.p.fin.configurar) throw prohibido()
    if (!esFechaValida(d.data.fechaCorte)) throw invalido('Escribe una fecha válida.')
    if (d.data.fechaCorte > ctx.hoy) throw invalido('La fecha de corte no puede ser futura.')
    await ctx.payload.updateGlobal({ slug: 'fin-configuracion', overrideAccess: true, data: { fechaCorte: d.data.fechaCorte } })
    hecho.push(`fecha de corte ${d.data.fechaCorte}`)
  }
  return { hecho }
}

/* ───────────────────────────── sesiones (docs/61) ───────────────────────────── */

/**
 * Desde octubre de 2026 la sesión del panel dura 7 días (collections/Users.ts),
 * porque Finanzas se usa desde el icono del celular. La contraparte de esa
 * comodidad es poder cortar el acceso cuando se pierde un teléfono: cambiar
 * la contraseña NO cierra las sesiones que ya estaban abiertas (se comprobó
 * en Payload 3.86: el token sigue valiendo mientras exista su sesión en la
 * cuenta). Esto sí las cierra: la persona tendrá que escribir su contraseña
 * de nuevo en todos sus dispositivos. Solo los dueños y el superadministrador,
 * y las sesiones de un superadministrador solo las cierra otro superadministrador.
 */
type SesionGuardada = { id?: string | null; expiresAt?: string | null }
const sesionesVigentes = (s: SesionGuardada[] | null | undefined, ahora: number) =>
  (s ?? []).filter((x) => !x.expiresAt || Date.parse(x.expiresAt) > ahora).length

export async function personasConSesiones(ctx: Ctx): Promise<PersonaConSesiones[]> {
  if (!ctx.p.gestionarUsuarios) throw prohibido('Solo los dueños o el superadministrador.')
  const r = await ctx.payload.find({ collection: 'users', depth: 0, pagination: false, overrideAccess: true, sort: 'name' })
  const ahora = Date.now()
  return r.docs
    .filter((u) => ctx.p.superadmin || !u.esSuperadmin)
    .map((u) => ({ id: u.id, nombre: u.name, email: u.email, sesiones: sesionesVigentes(u.sessions, ahora), esSuperadmin: Boolean(u.esSuperadmin) }))
}

export async function cerrarSesiones(ctx: Ctx, usuarioId: number): Promise<{ cerradas: number }> {
  if (!ctx.p.gestionarUsuarios) throw prohibido('Solo los dueños o el superadministrador.')
  /* Igual que el logout de Payload: se lee la cuenta directo de la base (con
     sus sesiones, que ningún rol puede editar por la API) y se guarda vacía. */
  const u = await ctx.payload.db.findOne<User>({ collection: 'users', where: { id: { equals: usuarioId } } })
  if (!u) throw new ErrorFinanzas(404, 'No encontramos esa cuenta.')
  if (u.esSuperadmin && !ctx.p.superadmin) throw prohibido('Las sesiones de un superadministrador solo las cierra otro superadministrador.')
  const cerradas = sesionesVigentes(u.sessions, Date.now())
  await ctx.payload.db.updateOne({ id: usuarioId, collection: 'users', data: { ...u, sessions: [], updatedAt: null }, returning: false })
  ctx.payload.logger.info(`[finanzas] ${ctx.user.email} cerró ${cerradas} sesión(es) de ${u.email}`)
  return { cerradas }
}
