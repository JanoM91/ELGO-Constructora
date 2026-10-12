import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  abrirComprobante,
  adjuntarComprobante,
  anular,
  arranque,
  catalogo,
  cerrarSesiones,
  clasificar,
  contextoDesdeHeaders,
  corregir,
  type Ctx,
  detalle,
  equipo,
  ErrorFinanzas,
  fondos,
  liquidar,
  listar,
  moverDinero,
  obras,
  pendientes,
  personasConSesiones,
  registrar,
  resumen,
  revisarComprobante,
  saldos,
} from '@/lib/finanzas/servicio'
import { notaDeVoz } from '@/lib/finanzas/voz'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * /api/finanzas/* — la puerta de Finanzas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Igual que /api/chat y el webhook de WhatsApp, esta ruta solo atiende la
 * petición HTTP: verifica la sesión del panel (la misma cookie de Payload) y
 * le pasa el control a lib/finanzas/servicio.ts, que es quien decide qué
 * puede hacer cada rol. Una sola ruta con un pequeño enrutador para que la
 * revisión de sesión y el manejo de errores vivan en un solo lugar.
 *
 *   GET  catalogo                      cuentas, categorías, obras y áreas, permisos
 *   GET  obras?desde&hasta&estado      resultado por obra (ELGO)
 *   GET  resumen | pendientes | saldos
 *   GET  operaciones?desde&hasta&tipo&texto&estado&cuenta&obra
 *   POST operaciones                   registrar entrada o gasto
 *   GET  operaciones/:id               detalle con cobros, comprobantes y bitácora
 *   POST operaciones/:id/pagos         cobro o pago (parcial o total)
 *   POST operaciones/:id/comprobantes  subir comprobante (multipart, campo «archivo»)
 *   POST operaciones/:id/correccion | clasificacion | anulacion
 *   GET  comprobantes/:id/archivo      ver el archivo (revisa permisos cada vez)
 *   POST comprobantes/:id/revision
 *   POST arranque                      roles y catálogos sugeridos, fecha de corte
 *   GET  personas                      cuentas y cuántas sesiones abiertas tiene cada una
 *   POST personas/:id/cerrar-sesiones  cerrar todas sus sesiones (teléfono perdido, docs/61)
 *   GET  fondos                        dinero a cargo de cada persona (etapa 3, docs/62)
 *   GET  equipo                        id y nombre de las personas del panel (para «quién pagó de su bolsa»)
 *   POST movimientos-internos          traspaso entre cuentas, aportación o retiro de socio
 *   POST voz                           texto dictado en el teléfono → borrador para el formulario (Claude)
 *
 * Los reintentos son seguros: los POST que crean algo aceptan el encabezado
 * `Idempotency-Key` y un segundo envío con la misma clave no duplica nada.
 */

export const dynamic = 'force-dynamic'
/* La nota de voz espera la respuesta de Claude: puede pasar de los 10 s de fábrica. */
export const maxDuration = 30

type Contexto = { params: Promise<{ ruta?: string[] }> }

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })

/** Un POST tiene que venir del mismo sitio (defensa extra contra formularios de otros dominios). */
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
  if (!Number.isInteger(n) || n <= 0) throw new ErrorFinanzas(404, 'Registro no encontrado.')
  return n
}

async function leerJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ErrorFinanzas(400, 'La petición no trae datos válidos.')
  }
}

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
    if (a === 'resumen' && !b) return json(await resumen(ctx))
    if (a === 'pendientes' && !b) return json(await pendientes(ctx))
    if (a === 'saldos' && !b) return json(await saldos(ctx))
    if (a === 'operaciones' && !b) {
      return json(await listar(ctx, {
        desde: q.get('desde') ?? undefined, hasta: q.get('hasta') ?? undefined, tipo: q.get('tipo') ?? undefined,
        texto: q.get('texto') ?? undefined, estado: q.get('estado') ?? undefined, cuenta: q.get('cuenta') ? Number(q.get('cuenta')) : null,
        actividad: q.get('obra') && /^\d+$/.test(q.get('obra')!) ? Number(q.get('obra')) : null,
      }))
    }
    if (a === 'obras' && !b) return json(await obras(ctx, { desde: q.get('desde') ?? undefined, hasta: q.get('hasta') ?? undefined, estado: q.get('estado') ?? undefined }))
    if (a === 'operaciones' && b && !c) return json(await detalle(ctx, idDeRuta(b)))
    if (a === 'comprobantes' && b && c === 'archivo') return abrirComprobante(ctx, idDeRuta(b))
    if (a === 'personas' && !b) return json(await personasConSesiones(ctx))
    if (a === 'fondos' && !b) return json(await fondos(ctx))
    if (a === 'equipo' && !b) return json(await equipo(ctx))
  } else {
    if (a === 'operaciones' && !b) {
      const r = await registrar(ctx, await leerJson(req), clave)
      return json(r, r.duplicado ? 200 : 201)
    }
    if (a === 'operaciones' && b) {
      const id = idDeRuta(b)
      if (c === 'pagos') return json(await liquidar(ctx, id, await leerJson(req), clave))
      if (c === 'correccion') return json((await corregir(ctx, id, await leerJson(req)), { ok: true }))
      if (c === 'clasificacion') return json((await clasificar(ctx, id, await leerJson(req)), { ok: true }))
      if (c === 'anulacion') return json((await anular(ctx, id, await leerJson(req)), { ok: true }))
      if (c === 'comprobantes') {
        let form: FormData
        try {
          form = await req.formData()
        } catch {
          return json({ error: 'No llegó el archivo.' }, 400)
        }
        const archivo = form.get('archivo')
        if (!(archivo instanceof File)) return json({ error: 'Elige un archivo o toma una foto.' }, 400)
        return json(await adjuntarComprobante(ctx, id, archivo, clave))
      }
    }
    if (a === 'comprobantes' && b && c === 'revision') {
      await revisarComprobante(ctx, idDeRuta(b))
      return json({ ok: true })
    }
    if (a === 'arranque' && !b) return json(await arranque(ctx, await leerJson(req)))
    if (a === 'personas' && b && c === 'cerrar-sesiones') return json(await cerrarSesiones(ctx, idDeRuta(b)))
    if (a === 'movimientos-internos' && !b) {
      const r = await moverDinero(ctx, await leerJson(req), clave)
      return json(r, r.duplicado ? 200 : 201)
    }
    if (a === 'voz' && !b) {
      /* Solo texto: el teléfono hace el dictado (voz → texto) y aquí Claude lo interpreta. */
      let texto = ''
      const tipo = req.headers.get('content-type') || ''
      if (tipo.includes('multipart/form-data')) {
        let form: FormData
        try {
          form = await req.formData()
        } catch {
          return json({ error: 'No llegó la nota.' }, 400)
        }
        const t = form.get('texto')
        if (typeof t === 'string') texto = t
      } else {
        const cuerpo = (await leerJson(req)) as { texto?: unknown }
        if (typeof cuerpo?.texto === 'string') texto = cuerpo.texto
      }
      return json(await notaDeVoz(ctx, { texto }))
    }
  }
  return json({ error: 'Ruta no encontrada.' }, 404)
}

async function manejar(metodo: 'GET' | 'POST', req: NextRequest, contexto: Contexto): Promise<Response> {
  const { ruta = [] } = await contexto.params
  try {
    return await atender(metodo, req, ruta)
  } catch (e) {
    if (e instanceof ErrorFinanzas) return json({ error: e.message }, e.estado)
    console.error('[api/finanzas] error inesperado:', e)
    return json({ error: 'Algo falló al guardar. No se registró nada a medias: intenta de nuevo.' }, 500)
  }
}

export async function GET(req: NextRequest, contexto: Contexto) {
  return manejar('GET', req, contexto)
}

export async function POST(req: NextRequest, contexto: Contexto) {
  return manejar('POST', req, contexto)
}
