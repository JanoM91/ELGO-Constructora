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

/* ───────────────────────────── propuestas de categoría u obra (MacAuto docs/63) ───────────────────────────── */

/** «  Grúas y  Arrastres » → «gruas y arrastres»: para comparar nombres sin acentos, mayúsculas ni espacios de más. */
export function normalizarNombre(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * ¿Lo que alguien escribió como «categoría nueva» ya existe en la lista?
 * Compara sin acentos ni mayúsculas y tolera una «s» final de diferencia
 * («Grúa» = «Grúas»). Si existe, se usa esa en vez de crear un pendiente.
 */
export function coincidenciaDeNombre<T extends { nombre: string }>(texto: unknown, lista: T[]): T | null {
  const t = normalizarNombre(texto)
  if (!t) return null
  const sinS = (x: string) => x.replace(/s$/, '')
  return lista.find((x) => normalizarNombre(x.nombre) === t) ?? lista.find((x) => sinS(normalizarNombre(x.nombre)) === sinS(t)) ?? null
}

/** Texto que escribe la persona para una propuesta o un auto nuevo: sin espacios de más y con tope de largo. */
export function textoPropuesta(s: unknown, max = 60): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}


/* ───────────────────────────── foto de ticket (MacAuto docs/68) ───────────────────────────── */

/**
 * Reparte `totalCentavos` en proporción a `partes` (centavos, todos > 0) y
 * cuadra al centavo: cada parte recibe su piso y los centavos que sobran van a
 * las de mayor fracción (método del mayor residuo). Sirve para que el IVA, un
 * descuento o un redondeo del ticket queden repartidos entre los conceptos y la
 * suma de los registros sea exactamente lo que salió de la caja.
 */
export function repartirProporcional(totalCentavos: number, partes: number[]): number[] {
  const suma = partes.reduce((a, p) => a + p, 0)
  if (!partes.length || suma <= 0) return partes.map(() => 0)
  const exactos = partes.map((p) => (totalCentavos * p) / suma)
  const pisos = exactos.map((x) => Math.floor(x))
  let sobran = totalCentavos - pisos.reduce((a, p) => a + p, 0)
  const orden = exactos.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (let k = 0; sobran > 0 && k < orden.length; k++, sobran--) pisos[orden[k].i] += 1
  return pisos
}

export type InterpretacionTicket = {
  comercio?: string | null
  fecha?: string | null
  total?: number | string | null
  conceptos?: { descripcion?: string | null; cantidad?: number | string | null; importe?: number | string | null; categoriaId?: number | string | null }[] | null
  dudas?: string[] | null
}

export type RenglonTicket = { concepto: string; centavos: number; leidoCentavos: number; categoria: number | null }

export const MAX_RENGLONES_TICKET = 30

/**
 * Lo que leyó la IA del ticket → renglones listos para guardar, uno por
 * concepto. Nunca inventa: una categoría que no existe o es del tipo
 * equivocado se descarta; una fecha imposible se cambia por hoy; si los
 * conceptos no suman el total cobrado, la diferencia se reparte en
 * proporción (decisión de Jano, 13-oct-2026) y queda anotada en `dudas`.
 * Devuelve `error` cuando no hay nada que guardar.
 */
export function armarTicket(
  i: InterpretacionTicket,
  cat: { categorias: { id: number; tipo: 'entrada' | 'gasto' }[] },
  tipo: 'entrada' | 'gasto',
  hoy: string,
  corte: string | null,
): { comercio: string; fechaReal: string; totalCentavos: number; renglones: RenglonTicket[]; dudas: string[]; error: string | null } {
  const dudas: string[] = []
  for (const d of i.dudas ?? []) if (typeof d === 'string' && d.trim()) dudas.push(d.trim().slice(0, 160))
  const comercio = textoPropuesta(i.comercio, 120)

  type Linea = { concepto: string; centavos: number; categoria: number | null }
  const positivas: Linea[] = []
  let negativas = 0
  ;(i.conceptos ?? []).forEach((c, k) => {
    const imp = num(c?.importe)
    if (imp == null || imp === 0 || Math.abs(imp) >= 1e9) return
    const centavos = Math.round(imp * 100)
    if (centavos < 0) {
      negativas += centavos
      return
    }
    const cantidad = num(c?.cantidad)
    const desc = textoPropuesta(c?.descripcion, 140) || `Concepto ${k + 1} del ticket`
    const catId = num(c?.categoriaId)
    const categoria = catId != null && cat.categorias.some((x) => x.id === catId && x.tipo === tipo) ? catId : null
    positivas.push({ concepto: `${cantidad && cantidad > 1 ? `${cantidad} × ` : ''}${desc}`.slice(0, 160), centavos, categoria })
  })
  if (!positivas.length) return { comercio, fechaReal: hoy, totalCentavos: 0, renglones: [], dudas, error: 'No pude leer los conceptos del ticket. Toma la foto de nuevo, de frente y con buena luz, o regístralo a mano.' }

  /* Más de 30 conceptos: los últimos se juntan en uno (una nota de remisión larga no debe producir 80 registros). */
  if (positivas.length > MAX_RENGLONES_TICKET) {
    const resto = positivas.splice(MAX_RENGLONES_TICKET - 1)
    positivas.push({ concepto: `Otros ${resto.length} conceptos del ticket`, centavos: resto.reduce((a, x) => a + x.centavos, 0), categoria: null })
    dudas.push(`El ticket tiene más de ${MAX_RENGLONES_TICKET} conceptos: los últimos ${resto.length} quedaron juntos en uno.`)
  }

  const sumaPositivas = positivas.reduce((a, x) => a + x.centavos, 0)
  const totalLeido = num(i.total)
  let total = totalLeido != null && totalLeido > 0 && totalLeido < 1e9 ? Math.round(totalLeido * 100) : sumaPositivas + negativas
  if (total <= 0) total = sumaPositivas
  const centavos = total === sumaPositivas ? positivas.map((x) => x.centavos) : repartirProporcional(total, positivas.map((x) => x.centavos))
  if (total !== sumaPositivas) {
    const dif = total - sumaPositivas
    if (Math.abs(dif) > sumaPositivas * 0.25) dudas.push(`Los conceptos suman ${formatoMXN(sumaPositivas, true)} y el total del ticket es ${formatoMXN(total, true)}: revisa que se hayan leído bien.`)
    else dudas.push(`Se repartieron ${formatoMXN(Math.abs(dif), true)} ${dif > 0 ? '(IVA o redondeo)' : '(descuento)'} entre los conceptos para que sumen el total del ticket.`)
  }

  let fechaReal = hoy
  if (typeof i.fecha === 'string' && i.fecha.trim()) {
    if (esFechaValida(i.fecha) && revisarFechaReal(i.fecha, hoy, corte) === null) fechaReal = i.fecha
    else dudas.push(`La fecha del ticket (${i.fecha.slice(0, 20)}) no se puede usar; quedó la de hoy.`)
  }

  return {
    comercio,
    fechaReal,
    totalCentavos: total,
    renglones: positivas.map((x, k) => ({ concepto: x.concepto, centavos: centavos[k], leidoCentavos: x.centavos, categoria: x.categoria })),
    dudas: [...new Set(dudas)],
    error: null,
  }
}

/* ───────────────────────────── pagos parciales y a plazos (MacAuto docs/68) ───────────────────────────── */

/** Un pago del acuerdo: con fecha o «sin fecha» (por ejemplo, «al terminar la obra»). `yaOcurrio`: se cobró o pagó al registrar. */
export type CuotaPlan = { fecha: string | null; centavos: number; yaOcurrio: boolean; nota: string }

export type InterpretacionPlan = {
  tipo?: string | null
  total?: number | string | null
  concepto?: string | null
  contraparte?: string | null
  categoriaId?: number | string | null
  /** La obra mencionada, tal cual la dijo la persona (ELGO). */
  obraTexto?: string | null
  pagos?: { fecha?: string | null; importe?: number | string | null; yaOcurrio?: boolean | null; nota?: string | null }[] | null
  dudas?: string[] | null
}

export type BorradorPlan = {
  tipo: 'entrada' | 'gasto'
  totalCentavos: number
  concepto: string
  contraparte: string
  categoria: number | null
  obraTexto: string | null
  cuotas: CuotaPlan[]
}

export const MAX_CUOTAS = 60

/** Orden del calendario: primero lo ya ocurrido, luego por fecha; lo que no tiene fecha, al final. */
export function ordenarCuotas<T extends { fecha: string | null; yaOcurrio?: boolean }>(cuotas: T[]): T[] {
  return [...cuotas].sort((a, b) => Number(Boolean(b.yaOcurrio)) - Number(Boolean(a.yaOcurrio)) || (a.fecha ?? '9999') .localeCompare(b.fecha ?? '9999'))
}

/**
 * Lo que entendió la IA de «la instalación es de 300 mil, nos dieron 90 de
 * anticipo y el resto en 3 estimaciones» → un borrador de plan que la persona ve y
 * confirma. Nunca inventa ids; si los pagos no suman el total, agrega un pago
 * sin fecha por el saldo (o toma la suma, si se pasan) y lo anota en dudas.
 */
export function armarPlan(
  i: InterpretacionPlan,
  cat: { categorias: { id: number; tipo: 'entrada' | 'gasto' }[] },
  hoy: string,
  corte: string | null,
): { borrador: BorradorPlan; dudas: string[] } {
  const dudas: string[] = []
  for (const d of i.dudas ?? []) if (typeof d === 'string' && d.trim()) dudas.push(d.trim().slice(0, 160))
  const tipo: 'entrada' | 'gasto' = i.tipo === 'entrada' ? 'entrada' : 'gasto'
  if (i.tipo !== 'entrada' && i.tipo !== 'gasto') dudas.push('No quedó claro si es dinero que entra o que sale; quedó como gasto.')

  const cuotas: CuotaPlan[] = []
  for (const p of (i.pagos ?? []).slice(0, MAX_CUOTAS)) {
    const imp = num(p?.importe)
    if (imp == null || imp <= 0 || imp >= 1e9) continue
    const centavos = Math.round(imp * 100)
    let fecha = typeof p?.fecha === 'string' && esFechaValida(p.fecha) ? p.fecha : null
    if (typeof p?.fecha === 'string' && p.fecha.trim() && !fecha) dudas.push(`Una fecha («${p.fecha.slice(0, 20)}») no se entendió; ese pago quedó sin fecha.`)
    let yaOcurrio = Boolean(p?.yaOcurrio)
    if (yaOcurrio && fecha && fecha > hoy) yaOcurrio = false
    if (yaOcurrio && !fecha) fecha = hoy
    if (yaOcurrio && fecha && corte && fecha < corte) {
      dudas.push(`Un pago ya hecho tiene fecha anterior al corte (${corte}); quedó con fecha de hoy.`)
      fecha = hoy
    }
    if (!yaOcurrio && fecha && fecha <= hoy) {
      /* Una fecha pasada que no se ha cobrado ni pagado: es un pago vencido. Se conserva y se avisa. */
      dudas.push(`El pago del ${fecha} ya pasó y no dice que se haya hecho: quedó como vencido.`)
    }
    cuotas.push({ fecha, centavos, yaOcurrio, nota: textoPropuesta(p?.nota, 80) })
  }
  if ((i.pagos ?? []).length > MAX_CUOTAS) dudas.push(`A lo más ${MAX_CUOTAS} pagos por acuerdo.`)

  const suma = cuotas.reduce((a, c) => a + c.centavos, 0)
  const totalLeido = num(i.total)
  let total = totalLeido != null && totalLeido > 0 && totalLeido < 1e9 ? Math.round(totalLeido * 100) : suma
  if (!cuotas.length && total > 0) {
    cuotas.push({ fecha: null, centavos: total, yaOcurrio: false, nota: '' })
    dudas.push('No se entendieron los pagos: quedó un solo pago sin fecha por el total.')
  } else if (suma < total) {
    cuotas.push({ fecha: null, centavos: total - suma, yaOcurrio: false, nota: 'Saldo sin fecha' })
    dudas.push(`Los pagos suman ${formatoMXN(suma, true)} de ${formatoMXN(total, true)}: el saldo quedó como un pago sin fecha.`)
  } else if (suma > total) {
    dudas.push(`Los pagos suman ${formatoMXN(suma, true)}, más que el total dicho (${formatoMXN(total, true)}): se tomó la suma de los pagos.`)
    total = suma
  }
  if (!total) dudas.push('No se entendió el importe total.')

  const catId = num(i.categoriaId)
  let categoria: number | null = null
  if (catId != null) {
    if (cat.categorias.some((c) => c.id === catId && c.tipo === tipo)) categoria = catId
    else dudas.push('La categoría no cuadra con el tipo; elígela.')
  }
  const concepto = textoPropuesta(i.concepto, 160)
  if (!concepto) dudas.push('Falta un concepto breve.')
  return {
    borrador: {
      tipo,
      totalCentavos: total,
      concepto,
      contraparte: textoPropuesta(i.contraparte, 160),
      categoria,
      obraTexto: textoPropuesta(i.obraTexto, 60) || null,
      cuotas: ordenarCuotas(cuotas),
    },
    dudas: [...new Set(dudas)],
  }
}

/** ¿El plan que confirmó la persona es guardable? Devuelve el mensaje de error o null. */
export function revisarPlan(totalCentavos: number, cuotas: CuotaPlan[], hoy: string, corte: string | null): string | null {
  if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) return 'Escribe el importe total del acuerdo.'
  if (!cuotas.length) return 'Agrega al menos un pago.'
  if (cuotas.length > MAX_CUOTAS) return `A lo más ${MAX_CUOTAS} pagos por acuerdo.`
  for (const c of cuotas) {
    if (!Number.isInteger(c.centavos) || c.centavos <= 0) return 'Cada pago debe llevar un importe mayor a cero.'
    if (c.fecha != null && !esFechaValida(c.fecha)) return 'Una de las fechas no es válida.'
    if (c.yaOcurrio) {
      if (!c.fecha) return 'Un pago ya hecho necesita fecha.'
      const e = revisarFechaReal(c.fecha, hoy, corte)
      if (e) return `Pago ya hecho: ${e}`
    }
  }
  const suma = cuotas.reduce((a, c) => a + c.centavos, 0)
  if (suma !== totalCentavos) return `Los pagos suman ${formatoMXN(suma, true)} y el total es ${formatoMXN(totalCentavos, true)}. Deben coincidir al centavo.`
  if (cuotas.every((c) => c.yaOcurrio)) return 'Todo ya se pagó: regístralo como una entrada o un gasto normal.'
  return null
}

export type EstadoCuota = 'cubierta' | 'parcial' | 'vencida' | 'proxima' | 'futura' | 'sin_fecha'

/**
 * Cómo va un calendario de pagos: lo cobrado/pagado se aplica a las cuotas en
 * orden (las de fecha más antigua primero; las sin fecha al final). Así no
 * importa si el cliente pagó $40,000 en vez de $50,000: la siguiente cuota
 * muestra lo que le falta. `proxima` es la primera cuota con saldo.
 */
export function estadoCalendario(cuotas: { fecha: string | null; centavos: number; nota?: string | null }[], pagadoCentavos: number, hoy: string) {
  let resto = Math.max(0, pagadoCentavos)
  const orden = cuotas.map((c, i) => ({ c, i })).sort((a, b) => (a.c.fecha ?? '9999').localeCompare(b.c.fecha ?? '9999') || a.i - b.i)
  let proxima: { fecha: string | null; faltaCentavos: number; numero: number } | null = null
  const filas = orden.map(({ c }, k) => {
    const aplicado = Math.min(resto, c.centavos)
    resto -= aplicado
    const falta = c.centavos - aplicado
    let estado: EstadoCuota
    if (falta === 0) estado = 'cubierta'
    else if (aplicado > 0) estado = 'parcial'
    else if (!c.fecha) estado = 'sin_fecha'
    else if (c.fecha < hoy) estado = 'vencida'
    else estado = 'futura'
    if (falta > 0 && !proxima) {
      proxima = { fecha: c.fecha, faltaCentavos: falta, numero: k + 1 }
      if (estado === 'futura') estado = 'proxima'
    }
    if (estado === 'parcial' && c.fecha && c.fecha < hoy) estado = 'vencida'
    return { numero: k + 1, fecha: c.fecha, centavos: c.centavos, pagadoCentavos: aplicado, faltaCentavos: falta, estado, nota: c.nota ?? '' }
  })
  return { cuotas: filas, proxima: proxima as { fecha: string | null; faltaCentavos: number; numero: number } | null, vencidas: filas.filter((f) => f.estado === 'vencida').length }
}
