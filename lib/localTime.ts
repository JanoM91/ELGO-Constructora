import { site } from './site'

/**
 * Hora local del negocio — las dos conversiones, hechas bien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO EXISTE Y NO SE USA `new Date()` A SECAS
 * ─────────────────────────────────────────────────────────────────────────────
 * El servidor de Vercel corre en UTC. El negocio está en México. Si se confía
 * en la hora implícita del servidor, una cita de las 11:00 se guarda como las
 * 11:00 UTC y en Xalapa son las 5:00 de la mañana. El cliente llega a las
 * once y no hay nadie, o peor: el sistema le dice que las 11:00 está fuera del
 * horario de atención.
 *
 * Por eso aquí la zona horaria es SIEMPRE explícita, sale de
 * `site.location.timeZone` y nunca se asume.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DIRECCIÓN DIFÍCIL
 * ─────────────────────────────────────────────────────────────────────────────
 * Pasar de un instante a "qué hora es allá" es fácil: `Intl` lo hace.
 * La otra dirección —"el 25 de agosto a las 13:00 en México, ¿qué instante es?"—
 * no tiene función nativa, y es justo la que hace falta para guardar una cita.
 *
 * El método: se supone que la hora local es UTC, se mide cuánto se equivocó esa
 * suposición preguntándole a `Intl`, y se corrige. Se hace DOS veces porque en
 * los dos días del año en que cambia el horario de verano, la primera medición
 * puede caer del lado equivocado del salto.
 *
 * México abolió el horario de verano en 2022, así que hoy este cuidado no se
 * nota. Se hace igual porque el sistema es replicable a otros lugares y porque
 * un error de una hora, dos días al año, es de los que nadie encuentra nunca.
 */

/** Cuánto se adelanta la zona respecto a UTC, en milisegundos, en ese instante. */
function desfaseEnZona(instante: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante)

  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? '0')
  /* `hourCycle` de en-US con hour12:false puede devolver 24 a medianoche. */
  const hora = v('hour') % 24

  const comoSiFueraUtc = Date.UTC(v('year'), v('month') - 1, v('day'), hora, v('minute'), v('second'))
  /* Se recortan los milisegundos del instante: formatToParts no los devuelve y
     compararlos introduciría un error de hasta 999 ms en el desfase. */
  return comoSiFueraUtc - Math.floor(instante.getTime() / 1000) * 1000
}

export type PartesLocales = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 0 = domingo, 1 = lunes… igual que getDay() de JavaScript. */
  weekday: number
}

const DIA_A_NUMERO: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Qué día y qué hora es en el negocio, para un instante dado. */
export function partesLocales(instante: Date, zona: string = site.location.timeZone): PartesLocales {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instante)

  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? '0')
  const diaTexto = partes.find((p) => p.type === 'weekday')?.value ?? 'Sun'

  return {
    year: v('year'),
    month: v('month'),
    day: v('day'),
    hour: v('hour') % 24,
    minute: v('minute'),
    weekday: DIA_A_NUMERO[diaTexto] ?? 0,
  }
}

/**
 * El instante exacto que corresponde a una fecha y hora locales del negocio.
 * Ver el encabezado: la corrección se aplica dos veces a propósito.
 */
export function instanteDesdeLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zona: string = site.location.timeZone,
): Date {
  const supuesto = Date.UTC(year, month - 1, day, hour, minute, 0)
  const primerDesfase = desfaseEnZona(new Date(supuesto), zona)
  let resultado = new Date(supuesto - primerDesfase)
  const segundoDesfase = desfaseEnZona(resultado, zona)
  if (segundoDesfase !== primerDesfase) resultado = new Date(supuesto - segundoDesfase)
  return resultado
}

/** "10:30" → 630 minutos desde la medianoche. Devuelve null si no se entiende. */
export function minutosDesdeTexto(texto: unknown): number | null {
  const m = String(texto ?? '').trim().match(/^(\d{1,2})\s*[:.]?\s*(\d{2})?$/)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (!Number.isFinite(h) || h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** 630 → "10:30". */
export function textoDesdeMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "martes 25 de agosto, 13:00" — como se lo decimos a una persona. */
export function fechaLegible(instante: Date, zona: string = site.location.timeZone): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: zona,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instante)
}

/** "2026-08-25", en hora del negocio. Para comparar días sin ambigüedad. */
export function diaLocal(instante: Date, zona: string = site.location.timeZone): string {
  const p = partesLocales(instante, zona)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
