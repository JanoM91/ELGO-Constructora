import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { importarLote } from '@/lib/inventario/importacion'
import {
  anularMovimiento,
  arranque,
  catalogo,
  contextoDesdeHeaders,
  crearMaterial,
  type Ctx,
  enTransaccion,
  ErrorInventario,
  existencias,
  material,
  materiales,
  movimientos,
  registrarMovimiento,
} from '@/lib/inventario/servicio'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * /api/inventario/* — la puerta de Inventario (misma idea que /api/finanzas)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Verifica la sesión del panel (la cookie de Payload) y le pasa el control a
 * lib/inventario/servicio.ts, que decide qué puede hacer cada rol.
 *
 * Fase A:
 *   GET  catalogo                         proveedores, familias, ubicaciones, obras, unidades, permisos
 *   GET  materiales?texto&familia&activos&pagina
 *   GET  materiales/:id                   ficha con existencias y movimientos
 *   POST materiales                       alta rápida (Compras o quien configura)
 *   GET  existencias?ubicacion&texto
 *   GET  movimientos?material&ubicacion&desde&hasta&pagina
 *   POST movimientos                      entrada, salida, traspaso, devolución, ajuste, merma, apertura
 *   POST movimientos/:id/anulacion
 *   POST arranque                         { que: ['proveedores','familias','ubicaciones'] }
 *   POST importar?fase=catalogo|documentos&desde&hasta   lote JSON ya revisado (lib/inventario/importacion.ts)
 *
 * Los POST que crean algo aceptan `Idempotency-Key`: un reintento no duplica.
 */

export const dynamic = 'force-dynamic'
/* La importación de una tanda de documentos puede tardar más que una consulta normal. */
export const maxDuration = 300

type Contexto = { params: Promise<{ ruta?: string[] }> }

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

function mismoOrigen(req: NextRequest): boolean {
  const origen = req.headers.get('origin')
  if (!origen) return true
  try {
    return new URL(origen).host === req.headers.get('host')
  } catch {
    return false
  }
}

function idDeRuta(s: string | undefined): number {
  const n = Number(s)
  if (!Number.isInteger(n) || n <= 0) throw new ErrorInventario(404, 'Registro no encontrado.')
  return n
}

async function leerJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ErrorInventario(400, 'La petición no trae datos válidos.')
  }
}

const numero = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null)

async function atender(metodo: 'GET' | 'POST', req: NextRequest, ruta: string[]): Promise<Response> {
  if (metodo === 'POST' && !mismoOrigen(req)) return json({ error: 'Origen no permitido.' }, 403)
  const payload = await getPayload({ config })
  const ctx: Ctx | null = await contextoDesdeHeaders(payload, req.headers)
  if (!ctx) return json({ error: 'Tu sesión terminó. Vuelve a entrar al panel.' }, 401)
  const clave = req.headers.get('idempotency-key')?.trim().slice(0, 120) || null
  const q = req.nextUrl.searchParams
  const [a, b, c] = ruta

  if (metodo === 'GET') {
    if (a === 'catalogo' && !b) return json(await catalogo(ctx))
    if (a === 'materiales' && !b) return json(await materiales(ctx, { texto: q.get('texto') ?? undefined, familia: numero(q.get('familia')), activos: q.get('activos') ?? undefined, pagina: numero(q.get('pagina')) ?? 1 }))
    if (a === 'materiales' && b && !c) return json(await material(ctx, idDeRuta(b)))
    if (a === 'existencias' && !b) return json(await existencias(ctx, { ubicacion: numero(q.get('ubicacion')), texto: q.get('texto') ?? undefined }))
    if (a === 'movimientos' && !b) return json(await movimientos(ctx, { material: numero(q.get('material')), ubicacion: numero(q.get('ubicacion')), desde: q.get('desde') ?? undefined, hasta: q.get('hasta') ?? undefined, pagina: numero(q.get('pagina')) ?? 1 }))
  } else {
    if (a === 'materiales' && !b) return json(await crearMaterial(ctx, await leerJson(req)), 201)
    if (a === 'movimientos' && !b) {
      const r = await registrarMovimiento(ctx, await leerJson(req), clave)
      return json(r, r.duplicado ? 200 : 201)
    }
    if (a === 'movimientos' && b && c === 'anulacion') {
      await anularMovimiento(ctx, idDeRuta(b), await leerJson(req))
      return json({ ok: true })
    }
    if (a === 'arranque' && !b) return json(await arranque(ctx, await leerJson(req)))
    if (a === 'importar' && !b) {
      const fase = q.get('fase') === 'documentos' ? 'documentos' : q.get('fase') === 'resumen' ? 'resumen' : 'catalogo'
      const lote = await leerJson(req)
      return json(await enTransaccion(ctx, (tx) => importarLote(ctx, lote, tx, { fase, desde: numero(q.get('desde')) ?? 0, hasta: numero(q.get('hasta')) ?? undefined })))
    }
  }
  return json({ error: 'Ruta no encontrada.' }, 404)
}

async function manejar(metodo: 'GET' | 'POST', req: NextRequest, contexto: Contexto): Promise<Response> {
  const { ruta = [] } = await contexto.params
  try {
    return await atender(metodo, req, ruta)
  } catch (e) {
    if (e instanceof ErrorInventario) return json({ error: e.message }, e.estado)
    console.error('[api/inventario] error inesperado:', e)
    return json({ error: 'Algo falló al guardar. No se registró nada a medias: intenta de nuevo.' }, 500)
  }
}

export async function GET(req: NextRequest, contexto: Contexto) {
  return manejar('GET', req, contexto)
}

export async function POST(req: NextRequest, contexto: Contexto) {
  return manejar('POST', req, contexto)
}
