/**
 * Borrador de captura guardado en el teléfono (docs/61 §61.6, docs/62).
 *
 * Lo escriben dos pantallas: Captura (cada cambio, para no perder lo
 * capturado si la app se cierra) y Nota de voz (el borrador que armó la IA,
 * para que Captura lo muestre y la persona lo confirme). Vive en localStorage,
 * por persona y por tipo (entrada/gasto), dura 24 horas y nunca incluye fotos.
 */
export type Tipo = 'entrada' | 'gasto'
export type Medio = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque'
export type Asig = 'actividad' | 'general' | 'pendiente'
export type Estado = 'realizado' | 'pendiente' | 'propio'

export type Borrador = {
  v: 1
  guardadoEn: number
  /** De dónde salió: capturado a mano o armado por la nota de voz. */
  origen: 'manual' | 'voz'
  tipo: Tipo
  importe: string
  estado: Estado
  cuenta: number | null
  medio: Medio | null
  concepto: string
  categoria: number | null
  noSe: boolean
  asig: Asig | null
  asigTocada: boolean
  actividad: number | null
  fechaReal: string
  venceEl: string
  mas: boolean
  contraparte: string
  notas: string
  /** Quién pagó de su bolsa (solo con estado «propio»); null = quien captura. */
  reembolsoA: number | null
  /** Cuántos archivos había (no se conservan). */
  archivos: number
}

const VIGENCIA_MS = 24 * 60 * 60 * 1000

export const claveBorrador = (usuario: number, tipo: Tipo) => `fz-borrador:${usuario}:${tipo}`

export function leerBorrador(clave: string): Borrador | null {
  try {
    const raw = localStorage.getItem(clave)
    if (!raw) return null
    const b = JSON.parse(raw) as Borrador
    if (b?.v !== 1 || !Number.isFinite(b.guardadoEn) || Date.now() - b.guardadoEn > VIGENCIA_MS) {
      localStorage.removeItem(clave)
      return null
    }
    return b
  } catch {
    return null
  }
}

export function escribirBorrador(clave: string, b: Borrador | null) {
  try {
    if (b) localStorage.setItem(clave, JSON.stringify(b))
    else localStorage.removeItem(clave)
  } catch {
    /* sin almacenamiento (modo privado o lleno): se sigue sin borrador */
  }
}
