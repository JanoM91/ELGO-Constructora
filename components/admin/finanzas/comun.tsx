'use client'

/**
 * Piezas compartidas de las pantallas de Finanzas: llamadas a la API,
 * formatos y botones. Los importes llegan en centavos enteros y aquí solo se
 * formatean (lib/finanzas/reglas.ts).
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { createContext, useContext } from 'react'
import { formatoMXN } from '../../../lib/finanzas/reglas'
import type { Catalogo, OperacionVista } from '../../../lib/finanzas/tipos'

export const fmt = (c: number, siempre = false) => formatoMXN(c, siempre)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fecha(iso: string | null | undefined, conAnio = false): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES[m - 1]}${conAnio ? ' ' + y : ''}`
}
export function momento(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(d)
  } catch {
    return d.toLocaleString()
  }
}
/** «Luis Hernández» → «LH»; «mariana» → «M». Para el avatar del encabezado. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '')).toUpperCase()
}
export function nuevaClave(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  }
}

/* ───────── API ───────── */

export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje)
  }
}
async function leer<T>(r: Response): Promise<T> {
  let data: unknown = null
  try {
    data = await r.json()
  } catch {
    data = null
  }
  if (!r.ok) {
    const msg = (data as { error?: string } | null)?.error || (r.status === 401 ? 'Tu sesión terminó. Vuelve a entrar.' : 'No se pudo completar. Revisa tu conexión e intenta de nuevo.')
    throw new ErrorApi(r.status, msg)
  }
  return data as T
}
export const api = {
  async get<T>(ruta: string, params?: Record<string, string | number | null | undefined>): Promise<T> {
    const qs = params ? Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''
    const r = await fetch(`/api/finanzas/${ruta}${qs ? `?${qs}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
    return leer<T>(r)
  },
  async post<T>(ruta: string, cuerpo: unknown, clave?: string): Promise<T> {
    const r = await fetch(`/api/finanzas/${ruta}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(clave ? { 'Idempotency-Key': clave } : {}) },
      body: JSON.stringify(cuerpo),
    })
    return leer<T>(r)
  },
  async subir<T>(ruta: string, archivo: File, clave: string): Promise<T> {
    const form = new FormData()
    form.append('archivo', archivo)
    const r = await fetch(`/api/finanzas/${ruta}`, { method: 'POST', credentials: 'same-origin', headers: { 'Idempotency-Key': clave }, body: form })
    return leer<T>(r)
  },
  /** Un formulario multipart ya armado (la foto de ticket). Con `clave`, reintentar no duplica. */
  async formulario<T>(ruta: string, form: FormData, clave?: string): Promise<T> {
    const r = await fetch(`/api/finanzas/${ruta}`, { method: 'POST', credentials: 'same-origin', headers: clave ? { 'Idempotency-Key': clave } : undefined, body: form })
    return leer<T>(r)
  },
}

/* ───────── contexto ───────── */

export type ContextoFinanzas = { catalogo: Catalogo; base: string; rutaAdmin: string; soloCaptura: boolean }
export const FinanzasCtx = createContext<ContextoFinanzas | null>(null)
export function useFinanzas(): ContextoFinanzas {
  const c = useContext(FinanzasCtx)
  if (!c) throw new Error('Falta FinanzasCtx')
  return c
}

/* ───────── íconos ───────── */

const TRAZOS: Record<string, React.ReactNode> = {
  entra: <path d="M17 7L7 17M7 9.5V17h7.5" />,
  sale: <path d="M7 17L17 7M9.5 7H17v7.5" />,
  mic: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>),
  camara: (<><path d="M4 8h3l1.8-2.6h6.4L17 8h3v11H4z" /><circle cx="12" cy="13.2" r="3.4" /></>),
  clip: <path d="M20 11.5l-8.4 8.4a5 5 0 0 1-7.1-7.1L13 4.4a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alerta: (<><path d="M12 4l9 16H3z" /><path d="M12 10v4.2M12 17.2h.01" /></>),
  buscar: (<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  flecha: <path d="M9.5 6l6 6-6 6" />,
  atras: <path d="M14.5 6l-6 6 6 6" />,
  inicio: <path d="M3 11l9-7 9 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5z" />,
  lista: <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  bandeja: (<><path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" /><path d="M5.5 5h13l2.5 8.5V19H3v-5.5z" /></>),
  mas: <path d="M12 5v14M5 12h14" />,
  ticket: (<><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>),
  calendario: (<><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 14h2M12 14h2M8 17h2" /></>),
  obra: (<><path d="M3 20h18M5 20V10l5-3v13M10 20V5l9 5v10" /><path d="M13 13h3M13 16h3" /></>),
  cartera: (<><path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9.5a1.5 1.5 0 0 1-1.5 1.5H4z" /><path d="M4 7.5V6a2 2 0 0 1 2-2h10" /></>),
  ajustes: (<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>),
  candado: (<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></>),
  auto: (<><path d="M4 16.5V12l2.2-5.2A1.5 1.5 0 0 1 7.6 6h8.8a1.5 1.5 0 0 1 1.4.8L20 12v4.5" /><path d="M3 12h18M4 16.5h16" /><circle cx="7.5" cy="16.5" r="1.9" /><circle cx="16.5" cy="16.5" r="1.9" /></>),
  archivo: (<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>),
  compartir: (<><path d="M12 14.5V3.5M8.5 7L12 3.5 15.5 7" /><path d="M6.5 11v9h11v-9" /></>),
  traspaso: (<><path d="M4 9h13M13 5l4 4-4 4" /><path d="M20 15H7M11 11l-4 4 4 4" /></>),
  socio: (<><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>),
  fondo: (<><path d="M4 11.5c0-1.4 1-2.5 2.4-2.5H15l3-3" /><path d="M4 11.5V17a2 2 0 0 0 2 2h9.5a2.5 2.5 0 0 0 2.4-1.8L20 11.5H9.5" /><path d="M8 15h3" /></>),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  enviar: <path d="M4 12l16-8-4 16-4-6z" />,
}
export function Icono({ n, chico }: { n: keyof typeof TRAZOS | string; chico?: boolean }) {
  return (
    <svg className={`fz-i${chico ? ' fz-i--chico' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      {TRAZOS[n] ?? null}
    </svg>
  )
}

/* ───────── piezas ───────── */

/**
 * «Volver»: regresa a la pantalla anterior o, si la app se abrió directo en
 * esta (por ejemplo desde el icono del celular, donde no hay botón de atrás
 * del navegador), lleva a la ruta de respaldo.
 */
export function Volver({ a, etiqueta = 'Volver' }: { a: string; etiqueta?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      className="fz-volver"
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push(a)
      }}
    >
      <Icono n="atras" chico />
      {etiqueta}
    </button>
  )
}

export function Pastilla({ tono, children }: { tono: 'ok' | 'aviso' | 'malo' | 'info' | 'gris'; children: React.ReactNode }) {
  return <span className={`fz-pill fz-pill--${tono}`}>{children}</span>
}

export function Aviso({ tono = 'info', children }: { tono?: 'ok' | 'aviso' | 'malo' | 'info' | 'gris'; children: React.ReactNode }) {
  return (
    <div className={`fz-aviso fz-aviso--${tono}`} role={tono === 'malo' ? 'alert' : undefined}>
      <Icono n={tono === 'ok' ? 'check' : tono === 'info' || tono === 'gris' ? 'candado' : 'alerta'} chico />
      <div>{children}</div>
    </div>
  )
}

export function Segmentos<T extends string>({ valor, opciones, alCambiar, etiqueta }: { valor: T; opciones: [T, string][]; alCambiar: (v: T) => void; etiqueta: string }) {
  return (
    <div className={`fz-seg fz-seg--${opciones.length}`} role="radiogroup" aria-label={etiqueta}>
      {opciones.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} className={valor === v ? 'is-on' : ''} onClick={() => alCambiar(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function Ficha({ activa, onClick, children, punteada }: { activa?: boolean; onClick: () => void; children: React.ReactNode; punteada?: boolean }) {
  return (
    <button type="button" className={`fz-chip${activa ? ' is-on' : ''}${punteada ? ' fz-chip--punteada' : ''}`} aria-pressed={Boolean(activa)} onClick={onClick}>
      {children}
    </button>
  )
}

export function pastillasDe(op: OperacionVista): React.ReactNode[] {
  const out: React.ReactNode[] = []
  if (op.anulada) out.push(<Pastilla key="a" tono="malo">Anulado</Pastilla>)
  if (op.pendienteCentavos > 0 && op.pagadoCon === 'propio') out.push(<Pastilla key="p" tono="aviso">Por reembolsar {fmt(op.pendienteCentavos)}{op.reembolsoA ? ` a ${op.reembolsoA.nombre.split(' ')[0]}` : ''}</Pastilla>)
  else if (op.pendienteCentavos > 0) out.push(<Pastilla key="p" tono="aviso">{op.tipo === 'entrada' ? 'Por cobrar' : 'Por pagar'} {fmt(op.pendienteCentavos)}</Pastilla>)
  if (!op.anulada && esInterno(op.tipo)) out.push(<Pastilla key="i" tono="gris">{NOMBRE_INTERNO[op.tipo]}</Pastilla>)
  if (!op.anulada && !esInterno(op.tipo) && op.clasificacion === 'pendiente') out.push(<Pastilla key="c" tono="aviso">{op.categoriaPropuesta || op.actividadPropuesta ? 'Propuesta por revisar' : 'Sin clasificar'}</Pastilla>)
  if (!op.anulada && !esInterno(op.tipo) && op.evidencia === 'pendiente') out.push(<Pastilla key="e" tono="gris">Sin comprobante</Pastilla>)
  if (op.evidencia === 'por_revisar') out.push(<Pastilla key="r" tono="info">Comprobante por revisar</Pastilla>)
  if (op.porRevisar) out.push(<Pastilla key="pc" tono="aviso">{op.grupoTicket ? 'Ticket por completar' : 'Por completar'}</Pastilla>)
  if (!op.anulada && op.calendario && op.pendienteCentavos > 0) {
    const px = op.calendario.proxima
    out.push(<Pastilla key="pl" tono={op.calendario.vencidas ? 'malo' : 'info'}>{op.calendario.vencidas ? `${op.calendario.vencidas} pago${op.calendario.vencidas === 1 ? '' : 's'} vencido${op.calendario.vencidas === 1 ? '' : 's'}` : px ? `Próximo pago ${px.fecha ? fecha(px.fecha) : 'sin fecha'} · ${fmt(px.faltaCentavos)}` : 'Plan de pagos'}</Pastilla>)
  }
  return out
}

/* ───────── movimientos internos (etapa 3, docs/62) ───────── */

export const NOMBRE_INTERNO: Record<string, string> = { traspaso: 'Traspaso', aportacion: 'Aportación de socio', retiro: 'Retiro de socio' }
export const esInterno = (tipo: string) => tipo === 'traspaso' || tipo === 'aportacion' || tipo === 'retiro'

/** Cómo se pinta el importe y el icono según el tipo: entra (+, turquesa), sale (−) o traspaso (sin signo). */
export function signoDe(op: OperacionVista): { signo: string; clase: string; icono: string } {
  if (op.tipo === 'traspaso') return { signo: '', clase: ' is-neutro', icono: 'traspaso' }
  if (op.tipo === 'entrada' || op.tipo === 'aportacion') return { signo: '+', clase: ' is-entra', icono: op.tipo === 'aportacion' ? 'socio' : 'entra' }
  return { signo: '−', clase: '', icono: op.tipo === 'retiro' ? 'socio' : 'sale' }
}

export function subtituloDe(op: OperacionVista): string {
  if (op.tipo === 'traspaso') return op.traspaso ? `${op.traspaso.de} → ${op.traspaso.a}` : 'Traspaso'
  if (op.tipo === 'aportacion' || op.tipo === 'retiro') return [NOMBRE_INTERNO[op.tipo], op.contraparte, op.cuentas.join(', ')].filter(Boolean).join(' · ')
  const pagado = op.pagadoCon === 'propio' ? `Pagó ${op.reembolsoA?.nombre.split(' ')[0] ?? 'alguien'} de su bolsa` : op.cuentas.join(', ')
  const categoria = op.categoria?.nombre ?? (op.categoriaPropuesta ? `Propuso «${op.categoriaPropuesta}»` : 'Sin clasificar')
  return [categoria, pagado, op.actividad?.nombre ?? (op.actividadPropuesta ? `obra propuesta «${op.actividadPropuesta}»` : '')].filter(Boolean).join(' · ')
}

export function FilaOperacion({ op }: { op: OperacionVista }) {
  const { base } = useFinanzas()
  const { signo, clase, icono } = signoDe(op)
  const ico = op.tipo === 'traspaso' ? 'is-neutro' : clase === ' is-entra' ? 'is-entra' : 'is-sale'
  return (
    <Link className="fz-fila" href={`${base}/operacion/${op.id}`}>
      <span className={`fz-fila__ico ${ico}`}><Icono n={icono} /></span>
      <span className="fz-fila__main">
        <span className="fz-fila__t1">{op.concepto}</span>
        <span className="fz-fila__t2">{subtituloDe(op)}</span>
        <span className="fz-fila__pills">{pastillasDe(op)}</span>
      </span>
      <span className={`fz-monto${clase}${op.anulada ? ' is-anulado' : ''}`}>{signo}{fmt(op.totalCentavos)}</span>
    </Link>
  )
}

export function ListaPorDia({ filas, hoy, vacio }: { filas: OperacionVista[]; hoy: string; vacio: string }) {
  if (!filas.length) return <div className="fz-tarjeta fz-vacio">{vacio}</div>
  const grupos: { dia: string; filas: OperacionVista[] }[] = []
  for (const f of filas) {
    const g = grupos[grupos.length - 1]
    if (g && g.dia === f.fechaReal) g.filas.push(f)
    else grupos.push({ dia: f.fechaReal, filas: [f] })
  }
  const ayer = (() => {
    const [y, m, d] = hoy.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  })()
  return (
    <div className="fz-tarjeta fz-lista">
      {grupos.map((g) => (
        <div key={g.dia}>
          <div className="fz-dia">{g.dia === hoy ? 'Hoy' : g.dia === ayer ? 'Ayer' : fecha(g.dia, true)}</div>
          {g.filas.map((f) => (
            <FilaOperacion key={f.id} op={f} />
          ))}
        </div>
      ))}
    </div>
  )
}
