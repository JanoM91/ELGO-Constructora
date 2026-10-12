/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Reglas de dinero y fechas de Finanzas (lógica pura)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POR QUÉ ESTE ARCHIVO NO IMPORTA NADA: así corre con `node` pelón en
 * scripts/probarFinanzas.mjs, igual que lib/mapLinks.ts. Todo lo que decide
 * si un importe o una fecha son válidos vive aquí, y las pruebas
 * lo ejercitan sin base de datos.
 *
 * DINERO: en la base se guarda en pesos con dos decimales (campo `number` de
 * Payload, columna `numeric` en Postgres). Para sumar y comparar se convierte
 * SIEMPRE a centavos enteros. Sumar pesos con decimales en JavaScript da
 * errores de redondeo (0.1 + 0.2 = 0.30000000000000004); sumar centavos
 * enteros, no.
 *
 * FECHAS: la fecha real de un movimiento es un día del calendario del negocio
 * ("2026-10-08"), no un instante. Se guarda como texto AAAA-MM-DD para que
 * nunca se recorra un día por la diferencia entre la zona horaria del
 * servidor (UTC en Vercel) y la del negocio.
 */

/* ───────────────────────────── dinero ───────────────────────────── */

/** Pesos (número o texto como "1,250.50" o "$1250.5") → centavos enteros. NaN si no es válido. */
export function aCentavos(valor: unknown): number {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return Number.NaN
    return Math.round(valor * 100)
  }
  const s = String(valor ?? '').replace(/[$,\s]/g, '')
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return Number.NaN
  const negativo = s.startsWith('-')
  const [entero, dec = ''] = s.replace('-', '').split('.')
  const c = Number.parseInt(entero, 10) * 100 + Number.parseInt((dec + '00').slice(0, 2), 10)
  return negativo ? -c : c
}

/** Centavos enteros → pesos con dos decimales, listo para guardar. */
export function aPesos(centavos: number): number {
  return Math.round(centavos) / 100
}

/** ¿El importe en pesos tiene a lo más dos decimales? */
export function tieneDosDecimalesOMenos(pesos: number): boolean {
  return Number.isFinite(pesos) && Math.abs(Math.round(pesos * 100) - pesos * 100) < 1e-6
}

/** Formato mexicano: $339,000 o $3,333.34 (los centavos solo cuando existen, o siempre con `siempreCentavos`). */
export function formatoMXN(centavos: number, siempreCentavos = false): string {
  if (!Number.isFinite(centavos)) return '—'
  const negativo = centavos < 0
  const c = Math.abs(Math.round(centavos))
  const entero = Math.floor(c / 100)
  const dec = c % 100
  const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const txt = `$${miles}${dec || siempreCentavos ? '.' + String(dec).padStart(2, '0') : ''}`
  return negativo ? `−${txt}` : txt
}

/* ───────────────────────────── fechas ───────────────────────────── */

/** ¿Es una fecha de calendario real con forma AAAA-MM-DD? (rechaza 2026-02-31) */
export function esFechaValida(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}

/** Día de calendario de un instante en una zona horaria IANA → "AAAA-MM-DD". */
export function diaEnZona(instante: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante)
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return `${p('year')}-${p('month')}-${p('day')}`
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/**
 * La fecha real de una operación: no puede ser futura ni anterior al corte.
 * Lo anterior al corte ya está en los saldos iniciales y entra por la
 * importación del histórico. Devuelve el mensaje de error o null.
 */
export function revisarFechaReal(fecha: unknown, hoy: string, corte: string | null): string | null {
  if (!esFechaValida(fecha)) return 'La fecha no es válida.'
  if (fecha > hoy) return 'La fecha real no puede ser futura. Si es un compromiso, usa la fecha de vencimiento.'
  if (corte && fecha < corte) return `Es anterior a la fecha de corte (${corte}). Ese periodo ya está en los saldos iniciales.`
  return null
}


/* ──────────────────────── estados derivados ──────────────────────── */

export type EstadoPago = 'liquidado' | 'parcial' | 'pendiente' | 'anulado'

/**
 * Lo pendiente sale de los movimientos, nunca se guarda a mano:
 * pendiente = total − lo cobrado/pagado. Así una operación admite varios
 * cobros o pagos sin duplicar nada.
 */
export function estadoDePago(totalCentavos: number, pagadoCentavos: number, anulada: boolean): { estado: EstadoPago; pendienteCentavos: number } {
  if (anulada) return { estado: 'anulado', pendienteCentavos: 0 }
  const pendiente = Math.max(0, totalCentavos - pagadoCentavos)
  if (pendiente === 0) return { estado: 'liquidado', pendienteCentavos: 0 }
  return { estado: pagadoCentavos === 0 ? 'pendiente' : 'parcial', pendienteCentavos: pendiente }
}

/** Saldo de una cuenta: saldo inicial + entradas − salidas (solo movimientos realizados y no anulados). */
export function saldoDeCuenta(saldoInicialCentavos: number, movimientos: { direccion: 'entra' | 'sale'; centavos: number; anulado?: boolean | null }[]): number {
  return movimientos.reduce((s, m) => (m.anulado ? s : s + (m.direccion === 'entra' ? m.centavos : -m.centavos)), saldoInicialCentavos)
}

/* ───────────────────────────── etapa 3: fondos y dinero interno (docs/62) ───────────────────────────── */

export type MovimientoDeFondo = { direccion: 'entra' | 'sale'; centavos: number; anulado?: boolean | null; modalidad?: string | null; fechaReal?: string | null }

/**
 * Qué ha pasado con el dinero a cargo de una persona (una cuenta de tipo
 * «fondo»): lo que se le entregó (todo lo que entró), lo que comprobó con
 * gastos (lo que salió como gasto), lo que devolvió (lo que salió como
 * traspaso) y lo que tiene en su poder (saldo inicial + entró − salió).
 */
export function resumenDeFondo(saldoInicialCentavos: number, movimientos: MovimientoDeFondo[]) {
  let entregado = 0, comprobado = 0, devuelto = 0, ultimo: string | null = null
  for (const m of movimientos) {
    if (m.anulado) continue
    if (m.direccion === 'entra') entregado += m.centavos
    else if (m.modalidad === 'traspaso') devuelto += m.centavos
    else comprobado += m.centavos
    if (m.fechaReal && (!ultimo || m.fechaReal > ultimo)) ultimo = m.fechaReal
  }
  return { saldoCentavos: saldoInicialCentavos + entregado - comprobado - devuelto, entregadoCentavos: entregado, comprobadoCentavos: comprobado, devueltoCentavos: devuelto, ultimoMovimiento: ultimo }
}

/** Concepto sugerido para un movimiento interno cuando la persona no escribe uno. */
export function conceptoInterno(tipo: 'traspaso' | 'aportacion' | 'retiro', de: string | null, a: string | null, contraparte: string | null): string {
  if (tipo === 'traspaso') return `Traspaso ${de ?? '?'} → ${a ?? '?'}`.slice(0, 160)
  if (tipo === 'aportacion') return `Aportación${contraparte ? ` de ${contraparte}` : ' de socio'}`.slice(0, 160)
  return `Retiro${contraparte ? ` de ${contraparte}` : ' de socio'}`.slice(0, 160)
}

/* ───────────────────────────── etapa 4: nota de voz (docs/62) ───────────────────────────── */

/** Lo que el modelo devuelve al interpretar la nota. Todo opcional: aquí se revisa contra el catálogo. */
export type InterpretacionVoz = {
  tipo?: string | null
  importe?: number | string | null
  concepto?: string | null
  categoriaId?: number | string | null
  cuentaId?: number | string | null
  estado?: string | null
  fechaReal?: string | null
  actividadId?: number | string | null
  contraparte?: string | null
  notas?: string | null
  dudas?: string[] | null
}

export type CatalogoParaVoz = {
  cuentas: { id: number; nombre: string }[]
  categorias: { id: number; nombre: string; tipo: 'entrada' | 'gasto' }[]
  actividades: { id: number; nombre: string }[]
}

export type BorradorVozBase = {
  tipo: 'entrada' | 'gasto'
  importe: string
  estado: 'realizado' | 'pendiente' | 'propio'
  cuenta: number | null
  medio: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | null
  concepto: string
  categoria: number | null
  asig: 'actividad' | 'general' | 'pendiente' | null
  actividad: number | null
  fechaReal: string
  contraparte: string
  notas: string
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Convierte lo que entendió el modelo en un borrador seguro: cada id tiene que
 * existir en el catálogo y ser del tipo correcto, la fecha tiene que estar
 * entre el corte y hoy, el importe ser positivo. Lo que no cuadra se descarta
 * y se anota en `dudas`, para que la persona lo complete en el formulario.
 * Nunca inventa un dato.
 */
export function armarBorradorVoz(i: InterpretacionVoz, cat: CatalogoParaVoz, hoy: string, corte: string | null, transcripcion: string): { borrador: BorradorVozBase; dudas: string[] } {
  const dudas: string[] = []
  for (const d of i.dudas ?? []) if (typeof d === 'string' && d.trim()) dudas.push(d.trim().slice(0, 160))
  const tipo: 'entrada' | 'gasto' = i.tipo === 'entrada' ? 'entrada' : 'gasto'
  if (i.tipo !== 'entrada' && i.tipo !== 'gasto') dudas.push('No quedó claro si entró o salió dinero; quedó como gasto.')

  const importeNum = num(i.importe)
  let importe = ''
  if (importeNum != null && importeNum > 0 && importeNum < 1e9) importe = (Math.round(importeNum * 100) / 100).toFixed(2).replace(/\.00$/, '')
  else dudas.push('No se entendió el importe.')

  const estado: BorradorVozBase['estado'] = i.estado === 'pendiente' ? 'pendiente' : i.estado === 'propio' && tipo === 'gasto' ? 'propio' : 'realizado'

  let cuenta: number | null = null
  const cuentaId = num(i.cuentaId)
  if (cuentaId != null) {
    if (cat.cuentas.some((c) => c.id === cuentaId)) cuenta = cuentaId
    else dudas.push('La cuenta mencionada no está en el catálogo.')
  }
  if (estado === 'realizado' && cuenta == null) dudas.push(tipo === 'entrada' ? 'Falta decir a qué cuenta o caja entró.' : 'Falta decir de qué cuenta o caja salió.')

  let categoria: number | null = null
  const categoriaId = num(i.categoriaId)
  if (categoriaId != null) {
    const c = cat.categorias.find((x) => x.id === categoriaId)
    if (c && c.tipo === tipo) categoria = c.id
    else dudas.push('La categoría no cuadra con el tipo de movimiento; elígela en el formulario.')
  }

  let actividad: number | null = null
  const actividadId = num(i.actividadId)
  if (actividadId != null && cat.actividades.some((a) => a.id === actividadId)) actividad = actividadId

  const asig: BorradorVozBase['asig'] = actividad != null ? 'actividad' : null

  let fechaReal = hoy
  if (typeof i.fechaReal === 'string' && esFechaValida(i.fechaReal)) {
    if (revisarFechaReal(i.fechaReal, hoy, corte) === null) fechaReal = i.fechaReal
    else dudas.push(`La fecha dicha (${i.fechaReal}) no se puede usar; quedó la de hoy.`)
  }

  const concepto = (typeof i.concepto === 'string' ? i.concepto.trim() : '').slice(0, 160)
  if (!concepto) dudas.push('Falta un concepto breve.')
  const contraparte = (typeof i.contraparte === 'string' ? i.contraparte.trim() : '').slice(0, 160)
  const notasModelo = (typeof i.notas === 'string' ? i.notas.trim() : '').slice(0, 800)
  const cita = transcripcion.trim().slice(0, 1000)
  const notas = [notasModelo, cita ? `Nota de voz: «${cita}»` : ''].filter(Boolean).join('\n').slice(0, 2000)

  return {
    borrador: { tipo, importe, estado, cuenta, medio: null, concepto, categoria, asig, actividad, fechaReal, contraparte, notas },
    dudas: [...new Set(dudas)],
  }
}
