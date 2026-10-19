/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Inventario — reglas puras (sin base de datos, sin Payload)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todo lo que se puede decidir con números y texto vive aquí, para probarlo
 * con `node` pelón (scripts/probarInventario.mjs):
 *
 *   - unidades: cómo se escribe cada unidad en los documentos y a cuál
 *     unidad base corresponde, y el factor para convertir (tramo → m, kg → m);
 *   - texto: normalización de descripciones para buscar y empatar;
 *   - empate por descripción: puntaje de parecido entre una línea de un
 *     documento y un material del catálogo;
 *   - existencias: la suma de movimientos por material y ubicación;
 *   - precios: variación contra el precio anterior del mismo proveedor,
 *     antigüedad, y la regla de precio estimado para el pronóstico.
 *
 * Dinero: igual que Finanzas, en centavos enteros para calcular. Aquí
 * los precios unitarios se manejan en centavos por unidad base.
 *
 * Este archivo NO importa nada a propósito.
 */

/* ───────────────────────────── unidades ───────────────────────────── */

export type UnidadBase = 'pieza' | 'metro' | 'kilogramo' | 'tramo' | 'rollo' | 'caja' | 'lote' | 'juego' | 'litro' | 'bolsa' | 'par'

export const UNIDADES_BASE: { value: UnidadBase; label: string; abrev: string }[] = [
  { value: 'pieza', label: 'Pieza', abrev: 'pza' },
  { value: 'metro', label: 'Metro', abrev: 'm' },
  { value: 'kilogramo', label: 'Kilogramo', abrev: 'kg' },
  { value: 'tramo', label: 'Tramo', abrev: 'tramo' },
  { value: 'rollo', label: 'Rollo', abrev: 'rollo' },
  { value: 'caja', label: 'Caja', abrev: 'caja' },
  { value: 'lote', label: 'Lote', abrev: 'lote' },
  { value: 'juego', label: 'Juego', abrev: 'jgo' },
  { value: 'litro', label: 'Litro', abrev: 'l' },
  { value: 'bolsa', label: 'Bolsa', abrev: 'bolsa' },
  { value: 'par', label: 'Par', abrev: 'par' },
]

const ALIAS_UNIDAD: Record<string, UnidadBase> = {
  pza: 'pieza', pzas: 'pieza', pz: 'pieza', pieza: 'pieza', piezas: 'pieza', pc: 'pieza', pcs: 'pieza', unidad: 'pieza', u: 'pieza', c_u: 'pieza', cu: 'pieza',
  m: 'metro', mt: 'metro', mts: 'metro', mtr: 'metro', mtrs: 'metro', metro: 'metro', metros: 'metro', ml: 'metro',
  kg: 'kilogramo', kgs: 'kilogramo', kilo: 'kilogramo', kilos: 'kilogramo', kilogramo: 'kilogramo', kilogramos: 'kilogramo',
  tramo: 'tramo', tramos: 'tramo', tr: 'tramo',
  rollo: 'rollo', rollos: 'rollo', rll: 'rollo',
  caja: 'caja', cajas: 'caja', cja: 'caja',
  lote: 'lote', lotes: 'lote',
  juego: 'juego', juegos: 'juego', jgo: 'juego', jgos: 'juego', kit: 'juego',
  l: 'litro', lt: 'litro', lts: 'litro', litro: 'litro', litros: 'litro',
  bolsa: 'bolsa', bolsas: 'bolsa',
  par: 'par', pares: 'par',
}

/** «PZAS.» → 'pieza'; «Mtr» → 'metro'; algo desconocido → null. */
export function normalizarUnidad(texto: unknown): UnidadBase | null {
  const t = String(texto ?? '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '_')
  if (!t) return null
  return ALIAS_UNIDAD[t] ?? null
}

export function abreviaturaUnidad(u: UnidadBase | string | null | undefined): string {
  return UNIDADES_BASE.find((x) => x.value === u)?.abrev ?? String(u ?? '')
}

export type AtributosParaConversion = { longitudTramo?: number | null; pesoPorMetroKg?: number | null }

/**
 * Factor para pasar de la unidad del documento a la unidad base del material:
 * cantidadBase = cantidadOriginal × factor; precioBase = precioOriginal ÷ factor.
 *
 * Devuelve null cuando no se puede convertir sin un dato que falta (la
 * longitud del tramo o el peso por metro), para que la partida quede marcada
 * y una persona lo resuelva. Nunca se inventa.
 */
export function factorDeConversion(unidadDoc: UnidadBase | null, unidadBase: UnidadBase, atributos: AtributosParaConversion = {}): number | null {
  if (!unidadDoc) return null
  if (unidadDoc === unidadBase) return 1
  const largo = atributos.longitudTramo ?? null
  const peso = atributos.pesoPorMetroKg ?? null
  if (unidadDoc === 'tramo' && unidadBase === 'metro') return largo && largo > 0 ? largo : null
  if (unidadDoc === 'metro' && unidadBase === 'tramo') return largo && largo > 0 ? 1 / largo : null
  if (unidadDoc === 'kilogramo' && unidadBase === 'metro') return peso && peso > 0 ? 1 / peso : null
  if (unidadDoc === 'metro' && unidadBase === 'kilogramo') return peso && peso > 0 ? peso : null
  /* Cualquier otra combinación (caja ↔ pieza, rollo ↔ metro) necesita un factor confirmado por una persona (equivalencia). */
  return null
}

/** Longitud usual de un tramo de tubo conduit en México. Solo como valor sugerido, nunca se aplica sin confirmar. */
export const LONGITUD_TRAMO_SUGERIDA_M = 3.05

/** Redondea a centavos un precio unitario convertido. */
export function redondearCentavos(valor: number): number {
  return Math.round(valor)
}

/** Aplica el factor a cantidad y precio (en centavos). Devuelve null si falta factor. */
export function normalizarPartida(cantidad: number | null, precioCentavos: number | null, factor: number | null): { cantidadBase: number | null; precioBaseCentavos: number | null } {
  if (factor == null || !(factor > 0)) return { cantidadBase: null, precioBaseCentavos: null }
  return {
    cantidadBase: cantidad == null ? null : Math.round(cantidad * factor * 10000) / 10000,
    precioBaseCentavos: precioCentavos == null ? null : redondearCentavos(precioCentavos / factor),
  }
}

/** Quita el IVA a un precio que lo incluye (tasa en %, p. ej. 16). */
export function sinIva(centavosConIva: number, tasaPct: number): number {
  return redondearCentavos(centavosConIva / (1 + tasaPct / 100))
}
export function conIva(centavosSinIva: number, tasaPct: number): number {
  return redondearCentavos(centavosSinIva * (1 + tasaPct / 100))
}

/* ───────────────────────────── texto ───────────────────────────── */

const SIN_ACENTO = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Texto de búsqueda: minúsculas, sin acentos, fracciones y pulgadas
 * uniformadas («1 1/4"» → «1-1/4in», «2½"» → «2-1/2in»), una sola forma para
 * PG/PD y sin palabras vacías.
 */
export function textoDeBusqueda(partes: unknown[]): string {
  const bruto = partes.map((p) => (p == null ? '' : String(p))).filter(Boolean).join(' ')
  return normalizarDescripcion(bruto)
}

const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'y', 'o', 'a', 'en', 'por', 'tipo', 'marca', 'mod', 'modelo', 'cat', 'no'])
const SINONIMOS: [RegExp, string][] = [
  [/\b(pared\s*gruesa|p\.?\s*g\.?|pg)\b/g, 'pg'],
  [/\b(pared\s*delgada|p\.?\s*d\.?|pd)\b/g, 'pd'],
  [/\b(galv(anizad[oa])?|galv\.)\b/g, 'galv'],
  [/\b(interruptor|int\.?|breaker)\b/g, 'interruptor'],
  [/\b(termomagnetico|termomagnetica|termo)\b/g, 'termomagnetico'],
  [/\b(conduit|cond\.?)\b/g, 'conduit'],
  /* «350 A», «350A», «350 amp» → «350 amp»; una «a» suelta (preposición) se queda y luego la quita VACIAS. */
  [/(\d)\s*(amp(?:eres|s)?|a)\b/g, '$1 amp'],
  [/\b(cal(ibre)?\.?)\b/g, 'cal'],
  [/\b(pza?s?|piezas?)\b/g, ''],
]

export function normalizarDescripcion(s: unknown): string {
  let t = SIN_ACENTO(String(s ?? '').toLowerCase())
  /* ½ ¼ ¾ → fracciones ASCII */
  t = t.replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4').replace(/⅛/g, ' 1/8').replace(/⅜/g, ' 3/8')
  /* «1 1/4"», «1-1/4''», «1 1/4 pulg» → 1-1/4in */
  t = t.replace(/(\d+)\s+(\d+\/\d+)\s*("|''|”|pulg(adas)?|in)?/g, '$1-$2in')
  t = t.replace(/(\d+(?:\/\d+)?)\s*("|''|”|pulg(?:adas)?\b)/g, '$1in')
  t = t.replace(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/g, '$1x$2')
  for (const [re, rep] of SINONIMOS) t = t.replace(re, rep)
  t = t.replace(/[^a-z0-9/\-\s]/g, ' ')
  return t
    .split(/\s+/)
    .filter((w) => w && !VACIAS.has(w))
    .join(' ')
    .trim()
}

export function fichas(s: string): Set<string> {
  return new Set(s.split(' ').filter(Boolean))
}

/**
 * Parecido entre una descripción de documento y un material: Jaccard sobre
 * fichas, con doble peso para fichas con números (medidas, calibres,
 * amperes), que son las que distinguen variantes. 0 a 1.
 */
export function parecido(textoDoc: string, textoMaterial: string): number {
  const a = fichas(normalizarDescripcion(textoDoc))
  const b = fichas(normalizarDescripcion(textoMaterial))
  if (!a.size || !b.size) return 0
  const peso = (w: string) => (/\d/.test(w) ? 2 : 1)
  let inter = 0
  let union = 0
  const todas = new Set([...a, ...b])
  for (const w of todas) {
    const p = peso(w)
    union += p
    if (a.has(w) && b.has(w)) inter += p
  }
  /* Penaliza contradicciones PG/PD y de número: si el documento dice pg y el material pd, no es el mismo. */
  if ((a.has('pg') && b.has('pd')) || (a.has('pd') && b.has('pg'))) return Math.min(inter / union, 0.4)
  return inter / union
}

export type CandidatoEmpate<T> = { material: T; confianza: number }

/** Ordena los materiales por parecido y devuelve los mejores (confianza > 0). */
export function mejoresCandidatos<T extends { descripcion: string; textoBusqueda?: string | null }>(textoDoc: string, materiales: T[], maximo = 5): CandidatoEmpate<T>[] {
  return materiales
    .map((m) => ({ material: m, confianza: parecido(textoDoc, m.textoBusqueda || m.descripcion) }))
    .filter((c) => c.confianza > 0)
    .sort((x, y) => y.confianza - x.confianza)
    .slice(0, maximo)
}

/** Número de parte: sin espacios ni guiones, mayúsculas. «LAL 36350-MB» → «LAL36350MB». */
export function normalizarNumeroParte(s: unknown): string {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/* ───────────────────────────── existencias ───────────────────────────── */

export type MovimientoParaExistencias = {
  material: number
  cantidad: number
  origen: number | null
  destino: number | null
  anulado?: boolean | null
}

/**
 * Existencias = suma de movimientos. Un movimiento resta en `origen` y suma
 * en `destino`; los anulados no cuentan. Devuelve un mapa «material|ubicacion» → cantidad.
 */
export function existenciasDesdeMovimientos(movs: MovimientoParaExistencias[]): Map<string, number> {
  const r = new Map<string, number>()
  const suma = (mat: number, ubi: number | null, q: number) => {
    if (ubi == null) return
    const k = `${mat}|${ubi}`
    r.set(k, Math.round(((r.get(k) ?? 0) + q) * 10000) / 10000)
  }
  for (const m of movs) {
    if (m.anulado) continue
    suma(m.material, m.origen, -m.cantidad)
    suma(m.material, m.destino, m.cantidad)
  }
  return r
}

export function existenciaDe(mapa: Map<string, number>, material: number, ubicacion: number): number {
  return mapa.get(`${material}|${ubicacion}`) ?? 0
}

export type TipoMovimiento = 'entrada_compra' | 'salida_obra' | 'traspaso' | 'devolucion' | 'ajuste' | 'merma' | 'apertura'

/** Qué ubicaciones exige cada tipo de movimiento. */
export function revisarMovimiento(tipo: TipoMovimiento, cantidad: number, origen: number | null, destino: number | null): string | null {
  if (!(cantidad > 0)) return 'La cantidad debe ser mayor que cero.'
  switch (tipo) {
    case 'entrada_compra':
    case 'apertura':
      return destino == null ? 'Indica a dónde entra el material.' : null
    case 'salida_obra':
    case 'traspaso':
    case 'devolucion':
      if (origen == null || destino == null) return 'Indica de dónde sale y a dónde llega.'
      return origen === destino ? 'Origen y destino no pueden ser la misma ubicación.' : null
    case 'ajuste':
      return origen == null && destino == null ? 'Indica la ubicación que se ajusta.' : null
    case 'merma':
      return origen == null ? 'Indica de dónde se pierde el material.' : null
  }
}

/* ───────────────────────────── precios ───────────────────────────── */

export function diasEntreFechas(desde: string, hasta: string): number {
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)))
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)))
  return Math.round((b - a) / 86400000)
}

/** Variación en % del precio nuevo contra el anterior (null si no hay anterior o es cero). */
export function variacionPct(anteriorCentavos: number | null, nuevoCentavos: number): number | null {
  if (anteriorCentavos == null || anteriorCentavos <= 0) return null
  return Math.round(((nuevoCentavos - anteriorCentavos) / anteriorCentavos) * 10000) / 100
}

export function esAlertaDePrecio(variacion: number | null, umbralPct: number): boolean {
  return variacion != null && Math.abs(variacion) > umbralPct
}

export type PrecioConocido = {
  proveedor: number
  fecha: string
  precioBaseCentavos: number
  vigenciaHasta?: string | null
  fuente?: string | null
}

export type PrecioEstimado = {
  precioBaseCentavos: number | null
  proveedor: number | null
  fecha: string | null
  regla: 'preferido' | 'mejor_vigente' | 'ultimo_viejo' | 'sin_precio'
  viejo: boolean
}

/**
 * Regla de precio estimado para una partida (pronóstico, §6 del prompt maestro):
 *   1. último precio del proveedor preferido si no es viejo;
 *   2. si no, el mejor precio no viejo entre proveedores;
 *   3. si no, el último precio conocido de cualquier fuente, marcado viejo;
 *   4. si no hay nada, sin precio.
 * Sin ajuste por inflación: se muestra la antigüedad.
 */
export function precioEstimado(precios: PrecioConocido[], hoy: string, diasViejo: number, proveedorPreferido: number | null): PrecioEstimado {
  const validos = precios.filter((p) => p.precioBaseCentavos > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha))
  if (!validos.length) return { precioBaseCentavos: null, proveedor: null, fecha: null, regla: 'sin_precio', viejo: false }
  const esViejo = (p: PrecioConocido) => diasEntreFechas(p.fecha, hoy) > diasViejo
  const masReciente = (xs: PrecioConocido[]) => [...xs].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))[0]

  if (proveedorPreferido != null) {
    const delPreferido = validos.filter((p) => p.proveedor === proveedorPreferido)
    if (delPreferido.length) {
      const u = masReciente(delPreferido)
      if (!esViejo(u)) return { precioBaseCentavos: u.precioBaseCentavos, proveedor: u.proveedor, fecha: u.fecha, regla: 'preferido', viejo: false }
    }
  }
  /* Mejor precio vigente: el más reciente de cada proveedor, y de esos el más barato. */
  const porProveedor = new Map<number, PrecioConocido>()
  for (const p of validos) {
    const prev = porProveedor.get(p.proveedor)
    if (!prev || prev.fecha < p.fecha) porProveedor.set(p.proveedor, p)
  }
  const vigentes = [...porProveedor.values()].filter((p) => !esViejo(p)).sort((a, b) => a.precioBaseCentavos - b.precioBaseCentavos)
  if (vigentes.length) return { precioBaseCentavos: vigentes[0].precioBaseCentavos, proveedor: vigentes[0].proveedor, fecha: vigentes[0].fecha, regla: 'mejor_vigente', viejo: false }
  const u = masReciente(validos)
  return { precioBaseCentavos: u.precioBaseCentavos, proveedor: u.proveedor, fecha: u.fecha, regla: 'ultimo_viejo', viejo: true }
}

export type PartidaParaPronostico = { cantidadBase: number | null; estimado: PrecioEstimado }

/** Total estimado y cobertura de una requisición. */
export function resumenPronostico(partidas: PartidaParaPronostico[], tasaIvaPct: number) {
  let subtotal = 0
  let conPrecio = 0
  let viejas = 0
  let importeSinPrecio = 0
  for (const p of partidas) {
    const q = p.cantidadBase ?? 0
    if (p.estimado.precioBaseCentavos != null && q > 0) {
      subtotal += Math.round(p.estimado.precioBaseCentavos * q)
      conPrecio++
      if (p.estimado.viejo) viejas++
    } else importeSinPrecio++
  }
  const total = partidas.length
  return {
    subtotalCentavos: subtotal,
    ivaCentavos: conIva(subtotal, tasaIvaPct) - subtotal,
    totalCentavos: conIva(subtotal, tasaIvaPct),
    partidas: total,
    conPrecio,
    sinPrecio: total - conPrecio,
    conPrecioViejo: viejas,
    coberturaPct: total ? Math.round((conPrecio / total) * 1000) / 10 : 0,
    _importeSinPrecio: importeSinPrecio,
  }
}

/** Partidas que acumulan el 80 % del importe (donde está el dinero). */
export function concentracion<T extends { importeCentavos: number }>(partidas: T[], umbral = 0.8): { top: T[]; pctDelTotal: number } {
  const total = partidas.reduce((s, p) => s + Math.max(0, p.importeCentavos), 0)
  if (!total) return { top: [], pctDelTotal: 0 }
  const ordenadas = [...partidas].sort((a, b) => b.importeCentavos - a.importeCentavos)
  const top: T[] = []
  let acumulado = 0
  for (const p of ordenadas) {
    top.push(p)
    acumulado += p.importeCentavos
    if (acumulado / total >= umbral) break
  }
  return { top, pctDelTotal: Math.round((acumulado / total) * 1000) / 10 }
}

/* ───────────────────────────── lectura (validación) ───────────────────────────── */

/** La suma de importes cuadra con el subtotal con tolerancia de 1 peso (100 centavos). */
export function cuadraSubtotal(importesCentavos: (number | null)[], subtotalCentavos: number | null, toleranciaCentavos = 100): boolean {
  if (subtotalCentavos == null) return true
  const suma = importesCentavos.reduce<number>((s, x) => s + (x ?? 0), 0)
  return Math.abs(suma - subtotalCentavos) <= toleranciaCentavos
}
