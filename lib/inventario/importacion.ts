/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Inventario — importación de lotes de documentos ya revisados
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Puente hasta la fase B (subir PDF desde la app): Claude lee los PDF fuera
 * de la app, arma un «lote» (JSON) con materiales propuestos, equivalencias y
 * documentos con sus partidas ya empatadas, y aquí se guarda todo en una sola
 * transacción con las mismas reglas del servicio:
 *
 *   - Un material ya conocido se reconoce por su equivalencia (proveedor +
 *     clave del proveedor) o por marca + número de parte; si no, se crea.
 *   - Un documento ya importado (proveedor + folio + versión + archivo) se
 *     omite: volver a correr el mismo lote no duplica nada.
 *   - Solo las partidas marcadas `aportaPrecio` escriben en el histórico
 *     (inv-precios). Las demás quedan en el documento con su observación
 *     (por ejemplo, precio que cambia entre versiones de un mismo folio).
 *   - Al final se recalculan, por material y proveedor, la variación contra
 *     el precio anterior (alerta si supera el umbral) y el último precio y
 *     el precio de referencia de cada material.
 *   - Todo queda en inv-bitacora.
 */
import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { aCentavos, aPesos } from '../finanzas/reglas'
import { esAlertaDePrecio, normalizarNumeroParte, UNIDADES_BASE, type UnidadBase, variacionPct } from './reglas'
import { arranque, type Ctx, ErrorInventario } from './servicio'

const unidades = UNIDADES_BASE.map((u) => u.value) as [UnidadBase, ...UnidadBase[]]

const EsquemaLote = z.object({
  nombre: z.string().min(1),
  familiasExtra: z.array(z.object({ nombre: z.string(), padre: z.string().nullable() })).default([]),
  proveedor: z
    .object({
      nombre: z.string(),
      claveCliente: z.string().nullable().optional(),
      sitioWeb: z.string().nullable().optional(),
      ciudad: z.string().nullable().optional(),
      contactos: z.array(z.object({ nombre: z.string(), correo: z.string().optional(), whatsapp: z.string().optional() })).default([]),
    })
    .optional(),
  materiales: z.array(
    z.object({
      ref: z.string(),
      descripcion: z.string().min(2),
      familia: z.string(),
      marca: z.string().nullable(),
      numeroParte: z.string().nullable(),
      unidadBase: z.enum(unidades),
      critico: z.boolean(),
      atributos: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
      notas: z.string().nullable(),
    }),
  ),
  equivalencias: z.array(
    z.object({ material: z.string(), proveedor: z.string(), claveProveedor: z.string(), textoOriginal: z.string(), unidadOriginal: z.string(), factor: z.number().positive() }),
  ),
  documentos: z.array(
    z.object({
      ref: z.string(),
      tipo: z.enum(['cotizacion', 'requisicion', 'factura', 'presupuesto', 'referencia_web']),
      proveedor: z.string(),
      folio: z.string(),
      version: z.number().int().positive(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      vigenciaHasta: z.string().nullable().optional(),
      subtotal: z.number().nullable(),
      iva: z.number().nullable(),
      total: z.number().nullable(),
      cuadra: z.boolean(),
      archivoNombre: z.string(),
      notas: z.string().nullable(),
      partidas: z.array(
        z.object({
          linea: z.number().int(),
          textoOriginal: z.string(),
          cantidad: z.number(),
          unidad: z.string(),
          precio: z.number(),
          importe: z.number(),
          marca: z.string().nullable(),
          claveProveedor: z.string(),
          material: z.string(),
          factor: z.number().positive(),
          aportaPrecio: z.boolean(),
          observaciones: z.array(z.object({ tipo: z.string(), texto: z.string() })).default([]),
        }),
      ),
    }),
  ),
})
export type Lote = z.infer<typeof EsquemaLote>

export type ResultadoImportacion = {
  materialesNuevos: number
  materialesExistentes: number
  equivalenciasNuevas: number
  documentosNuevos: number
  documentosOmitidos: string[]
  partidas: number
  precios: number
  alertas: { material: string; proveedor: string; antes: number; despues: number; variacionPct: number; fecha: string; folio: string }[]
}

/**
 * Alertas de precio de todos los documentos del lote ya guardados. Se piden al
 * final porque las tandas no llegan en orden de fecha: la alerta de un cambio
 * se asigna siempre al precio más reciente, que puede haber entrado en otra tanda.
 */
async function resumenDeAlertas(ctx: Ctx, lote: Lote, req: PayloadRequest, r: ResultadoImportacion): Promise<ResultadoImportacion> {
  const { payload } = ctx
  const proveedores = (await payload.find({ collection: 'inv-proveedores', pagination: false, limit: 500, req, overrideAccess: true, depth: 0 })).docs
  const ids: number[] = []
  for (const d of lote.documentos) {
    const prov = proveedores.find((p) => p.nombre === d.proveedor)?.id
    if (!prov) continue
    const doc = await payload.find({ collection: 'inv-documentos', limit: 1, req, overrideAccess: true, depth: 0, where: { and: [{ proveedor: { equals: prov } }, { folio: { equals: d.folio } }, { version: { equals: d.version } }, { archivoNombre: { equals: d.archivoNombre } }] } })
    if (doc.docs[0]) ids.push(doc.docs[0].id)
  }
  if (!ids.length) return r
  const partidas = (await payload.find({
    collection: 'inv-partidas', pagination: false, limit: 10000, req, overrideAccess: true, depth: 2,
    where: { and: [{ documento: { in: ids } }, { alertaPrecio: { equals: true } }] },
    populate: { 'inv-materiales': { descripcion: true }, 'inv-documentos': { folio: true, fechaDocumento: true, proveedor: true }, 'inv-proveedores': { nombreCorto: true } },
  })).docs
  for (const p of partidas) {
    const doc = p.documento as { folio?: string; fechaDocumento?: string; proveedor?: { nombreCorto?: string } } | null
    const v = p.variacionPct ?? 0
    const despues = p.precioUnitarioBase ?? 0
    r.alertas.push({
      material: (p.material as { descripcion?: string } | null)?.descripcion ?? p.textoOriginal,
      proveedor: doc?.proveedor?.nombreCorto ?? '',
      antes: Math.round((despues / (1 + v / 100)) * 100) / 100,
      despues, variacionPct: v, fecha: doc?.fechaDocumento ?? '', folio: doc?.folio ?? '',
    })
  }
  return r
}

const idDe = (v: unknown): number | null => (v == null ? null : typeof v === 'object' ? Number((v as { id: unknown }).id) : Number(v))

/**
 * Por pasos, para que ninguna petición rebase el tiempo de Vercel:
 *   fase «catalogo»   → familias, proveedor, materiales y equivalencias;
 *   fase «documentos» → los documentos [desde, hasta) con sus partidas y precios;
 *   fase «todo»       → todo junto (script local).
 * Los pasos 1 a 3 se repiten en cada fase sin escribir nada si ya existe:
 * así cada tanda de documentos sabe qué material es cada referencia.
 */
export type OpcionesImportacion = { fase?: 'todo' | 'catalogo' | 'documentos' | 'resumen'; desde?: number; hasta?: number }

export async function importarLote(ctx: Ctx, entrada: unknown, req: PayloadRequest, opciones: OpcionesImportacion = {}): Promise<ResultadoImportacion> {
  const fase = opciones.fase ?? 'todo'
  if (!(ctx.p.superadmin || ctx.p.inv.configurar)) throw new ErrorInventario(403, 'Importar lotes es de quien configura Inventario.')
  const parsed = EsquemaLote.safeParse(entrada)
  if (!parsed.success) throw new ErrorInventario(400, `El lote no es válido: ${parsed.error.issues[0]?.path.join('.')} — ${parsed.error.issues[0]?.message}`)
  const lote = parsed.data
  const { payload } = ctx
  const local = { req, overrideAccess: true, depth: 0 } as const
  const r: ResultadoImportacion = { materialesNuevos: 0, materialesExistentes: 0, equivalenciasNuevas: 0, documentosNuevos: 0, documentosOmitidos: [], partidas: 0, precios: 0, alertas: [] }
  if (fase === 'resumen') return resumenDeAlertas(ctx, lote, req, r)

  /* 1. Catálogos base: proveedores, familias y ubicaciones sugeridos si faltan; familias extra del lote. */
  const vacios: ('proveedores' | 'familias' | 'ubicaciones')[] = []
  if (!(await payload.count({ collection: 'inv-proveedores', overrideAccess: true, req })).totalDocs) vacios.push('proveedores')
  if (!(await payload.count({ collection: 'inv-familias', overrideAccess: true, req })).totalDocs) vacios.push('familias')
  if (!(await payload.count({ collection: 'inv-ubicaciones', overrideAccess: true, req })).totalDocs) vacios.push('ubicaciones')
  if (vacios.length) await arranque(ctx, { que: vacios }, req)

  const familias = (await payload.find({ collection: 'inv-familias', pagination: false, limit: 1000, ...local })).docs
  const idFamilia = (padre: number | null, nombre: string) => familias.find((f) => f.nombre === nombre && idDe(f.padre) === padre)?.id ?? null
  for (const f of lote.familiasExtra) {
    const padre = f.padre ? idFamilia(null, f.padre) : null
    if (f.padre && padre == null) {
      familias.push(await payload.create({ collection: 'inv-familias', data: { nombre: f.padre, activa: true, orden: 900 }, ...local }))
    }
    const padreId = f.padre ? idFamilia(null, f.padre) : null
    if (idFamilia(padreId, f.nombre) == null) familias.push(await payload.create({ collection: 'inv-familias', data: { nombre: f.nombre, padre: padreId, activa: true, orden: padreId ? 950 : 900 }, ...local }))
  }
  const familiaDe = (ruta: string): number | null => {
    const [padre, hija] = ruta.split('/')
    const p = idFamilia(null, padre)
    if (p == null) return null
    return hija ? idFamilia(p, hija) ?? p : p
  }

  const proveedores = (await payload.find({ collection: 'inv-proveedores', pagination: false, limit: 500, ...local })).docs
  const idProveedor = (nombre: string) => {
    const p = proveedores.find((x) => x.nombre === nombre)
    if (!p) throw new ErrorInventario(400, `El proveedor «${nombre}» no existe. Créalo antes de importar.`)
    return p.id
  }
  if (lote.proveedor) {
    const p = proveedores.find((x) => x.nombre === lote.proveedor!.nombre)
    if (p) {
      await payload.update({
        collection: 'inv-proveedores', id: p.id, ...local,
        data: {
          claveCliente: p.claveCliente || lote.proveedor.claveCliente || null,
          sitioWeb: p.sitioWeb || lote.proveedor.sitioWeb || null,
          contactos: p.contactos?.length ? p.contactos : lote.proveedor.contactos.map((c) => ({ nombre: c.nombre, correo: c.correo ?? null, whatsapp: c.whatsapp ?? null })),
        },
      })
    }
  }

  /* 2. Materiales: se reconocen por equivalencia o por marca + número de parte. */
  const equivalencias = (await payload.find({ collection: 'inv-equivalencias', pagination: false, limit: 100000, ...local })).docs
  const porClave = new Map(equivalencias.map((e) => [`${idDe(e.proveedor)}|${e.claveProveedor}|${e.textoOriginal}`, idDe(e.material) as number]))
  const existentes = (await payload.find({ collection: 'inv-materiales', pagination: false, limit: 100000, ...local, select: { marca: true, numeroParte: true } })).docs
  const porNumeroParte = new Map(existentes.filter((m) => m.marca && m.numeroParte).map((m) => [`${m.marca}|${normalizarNumeroParte(m.numeroParte)}`, m.id]))
  const idMaterial = new Map<string, number>()
  const equivDe = new Map(lote.equivalencias.map((e) => [e.material, e]))
  for (const m of lote.materiales) {
    const e = equivDe.get(m.ref)
    const ya = (e && porClave.get(`${idProveedor(e.proveedor)}|${e.claveProveedor}|${e.textoOriginal}`)) || (m.marca && m.numeroParte ? porNumeroParte.get(`${m.marca}|${normalizarNumeroParte(m.numeroParte)}`) : undefined)
    if (ya) {
      idMaterial.set(m.ref, ya)
      r.materialesExistentes++
      continue
    }
    const creado = await payload.create({
      collection: 'inv-materiales', ...local,
      data: {
        descripcion: m.descripcion, familia: familiaDe(m.familia), marca: m.marca, numeroParte: m.numeroParte, unidadBase: m.unidadBase, critico: m.critico,
        atributos: m.atributos as never, notas: m.notas, activo: true,
      },
    })
    idMaterial.set(m.ref, creado.id)
    if (m.marca && m.numeroParte) porNumeroParte.set(`${m.marca}|${normalizarNumeroParte(m.numeroParte)}`, creado.id)
    r.materialesNuevos++
  }

  /* 3. Equivalencias (la memoria del empate). */
  for (const e of lote.equivalencias) {
    const prov = idProveedor(e.proveedor)
    const k = `${prov}|${e.claveProveedor}|${e.textoOriginal}`
    if (porClave.has(k)) continue
    const material = idMaterial.get(e.material)
    if (!material) continue
    await payload.create({
      collection: 'inv-equivalencias', ...local,
      data: { textoOriginal: e.textoOriginal, proveedor: prov, claveProveedor: e.claveProveedor, material, unidadOriginal: e.unidadOriginal, factor: e.factor, confirmadaPor: ctx.user.id, confirmadaEn: ctx.hoy, activa: true },
    })
    porClave.set(k, material)
    r.equivalenciasNuevas++
  }

  /* 4. Documentos, partidas y precios. */
  const tocados = new Set<string>() // material|proveedor
  const preciosNuevos = new Set<number>()
  const documentos = fase === 'catalogo' ? [] : fase === 'documentos' ? lote.documentos.slice(opciones.desde ?? 0, opciones.hasta ?? lote.documentos.length) : lote.documentos
  for (const d of documentos) {
    const prov = idProveedor(d.proveedor)
    const ya = await payload.find({
      collection: 'inv-documentos', limit: 1, ...local,
      where: { and: [{ proveedor: { equals: prov } }, { folio: { equals: d.folio } }, { version: { equals: d.version } }, { archivoNombre: { equals: d.archivoNombre } }] },
    })
    if (ya.docs.length) {
      r.documentosOmitidos.push(`${d.folio} v${d.version}`)
      continue
    }
    const doc = await payload.create({
      collection: 'inv-documentos', ...local,
      data: {
        tipo: d.tipo, estado: 'confirmado', proveedor: prov, folio: d.folio, version: d.version, fechaDocumento: d.fecha, vigenciaHasta: d.vigenciaHasta ?? null,
        subtotal: d.subtotal, iva: d.iva, total: d.total, cuadra: d.cuadra, archivoNombre: d.archivoNombre, origen: 'importacion',
        lecturaNotas: `Importado en «${lote.nombre}»: leído del PDF y empatado por clave del proveedor.`, notas: d.notas,
        subidoPor: ctx.user.id, confirmadoPor: ctx.user.id, confirmadoEn: new Date().toISOString(),
      },
    })
    r.documentosNuevos++
    for (const p of d.partidas) {
      const material = idMaterial.get(p.material)
      const precioC = Math.round(p.precio * 100)
      const precioBase = Math.round((p.precio / p.factor) * 100) / 100
      const partida = await payload.create({
        collection: 'inv-partidas', ...local,
        data: {
          documento: doc.id, linea: p.linea, textoOriginal: p.textoOriginal, cantidadOriginal: p.cantidad, unidadOriginal: p.unidad,
          precioUnitarioOriginal: p.precio, importeOriginal: p.importe, marcaOriginal: p.marca, claveProveedor: p.claveProveedor, incluyeIva: false,
          material: material ?? null, metodoEmpate: 'clave_proveedor', confianzaEmpate: 1, estadoEmpate: material ? 'confirmado' : 'sin_material',
          factor: p.factor, cantidadBase: Math.round(p.cantidad * p.factor * 10000) / 10000, precioUnitarioBase: precioBase, importeBase: p.importe,
          observaciones: p.observaciones, revisadaPor: ctx.user.id,
        },
      })
      r.partidas++
      if (p.aportaPrecio && material && precioC > 0) {
        const precio = await payload.create({
          collection: 'inv-precios', ...local,
          data: {
            material, proveedor: prov, fecha: d.fecha, vigenciaHasta: d.vigenciaHasta ?? null, precioBase, unidadBase: (lote.materiales.find((m) => m.ref === p.material)?.unidadBase ?? 'pieza'),
            fuente: d.tipo === 'factura' ? 'factura' : 'cotizacion', documento: doc.id, partida: partida.id, anulado: false,
          },
        })
        r.precios++
        preciosNuevos.add(precio.id)
        tocados.add(`${material}|${prov}`)
      }
    }
    await payload.create({
      collection: 'inv-bitacora', ...local,
      data: { coleccion: 'inv-documentos', registro: doc.id, documento: doc.id, accion: 'confirmar', valorNuevo: `${d.folio} v${d.version} · ${d.partidas.length} partidas · ${d.archivoNombre}`, motivo: lote.nombre, usuario: ctx.user.id },
    })
  }

  /* 5. Variación contra el precio anterior del mismo proveedor, último precio y precio de referencia. */
  const conf = await payload.findGlobal({ slug: 'inv-configuracion', overrideAccess: true, req })
  const umbral = typeof conf?.umbralAlertaPrecio === 'number' ? conf.umbralAlertaPrecio : 5
  const materialesTocados = new Set([...tocados].map((k) => Number(k.split('|')[0])))
  for (const material of materialesTocados) {
    const precios = (await payload.find({
      collection: 'inv-precios', pagination: false, limit: 10000, req, overrideAccess: true, depth: 1,
      where: { and: [{ material: { equals: material } }, { anulado: { not_equals: true } }] },
      populate: { 'inv-documentos': { folio: true, version: true }, 'inv-proveedores': { nombreCorto: true }, 'inv-materiales': { descripcion: true } },
    })).docs
    const orden = (x: (typeof precios)[number]) => {
      const doc = x.documento as { folio?: string; version?: number } | null
      return `${x.fecha}|${doc?.folio ?? ''}|${String(doc?.version ?? 0).padStart(3, '0')}|${String(x.id).padStart(8, '0')}`
    }
    precios.sort((a, b) => (orden(a) < orden(b) ? -1 : 1))
    const ultimoPorProveedor = new Map<number, (typeof precios)[number]>()
    for (const p of precios) {
      const prov = idDe(p.proveedor) as number
      const anterior = ultimoPorProveedor.get(prov)
      if (anterior && aCentavos(anterior.precioBase) !== aCentavos(p.precioBase)) {
        const v = variacionPct(aCentavos(anterior.precioBase), aCentavos(p.precioBase))
        const alerta = esAlertaDePrecio(v, umbral)
        const partida = idDe(p.partida)
        if (partida) await payload.update({ collection: 'inv-partidas', id: partida, ...local, data: { variacionPct: v, alertaPrecio: alerta } })
        if (alerta && v != null && preciosNuevos.has(p.id)) {
          const prov = p.proveedor as { nombreCorto?: string }
          const doc = p.documento as { folio?: string }
          r.alertas.push({ material: (await payload.findByID({ collection: 'inv-materiales', id: material, ...local, select: { descripcion: true } })).descripcion, proveedor: prov?.nombreCorto ?? '', antes: anterior.precioBase, despues: p.precioBase, variacionPct: v, fecha: p.fecha, folio: doc?.folio ?? '' })
        }
      }
      ultimoPorProveedor.set(prov, p)
    }
    const ultimos = [...ultimoPorProveedor.values()]
    const masReciente = precios[precios.length - 1]
    const referencia = ultimos.reduce((min, p) => (min == null || aCentavos(p.precioBase) < aCentavos(min.precioBase) ? p : min), null as (typeof precios)[number] | null)
    await payload.update({
      collection: 'inv-materiales', id: material, ...local,
      data: {
        ultimoPrecio: masReciente ? { precioBase: masReciente.precioBase, proveedor: idDe(masReciente.proveedor), fecha: masReciente.fecha } : undefined,
        precioReferencia: referencia ? aPesos(aCentavos(referencia.precioBase)) : null,
      },
    })
  }

  await payload.create({
    collection: 'inv-bitacora', ...local,
    data: {
      coleccion: 'inv-documentos', accion: 'arranque', motivo: lote.nombre, usuario: ctx.user.id,
      valorNuevo: `Lote importado (${fase}${fase === 'documentos' ? ` ${(opciones.desde ?? 0) + 1}–${Math.min(opciones.hasta ?? lote.documentos.length, lote.documentos.length)} de ${lote.documentos.length}` : ''}): ${r.materialesNuevos} materiales nuevos, ${r.equivalenciasNuevas} equivalencias, ${r.documentosNuevos} documentos, ${r.partidas} partidas, ${r.precios} precios, ${r.alertas.length} alertas de precio.`,
    },
  })
  return r
}
