'use client'

/**
 * Piezas compartidas de las pantallas de Inventario: llamadas a /api/inventario,
 * contexto y formatos. Los botones, avisos e iconos se reutilizan de Finanzas
 * (components/admin/finanzas/comun.tsx) para que las dos apps se vean iguales.
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { abreviaturaUnidad } from '../../../lib/inventario/reglas'
import type { CatalogoInventario } from '../../../lib/inventario/tipos'
import { ErrorApi } from '../finanzas/comun'

export { Aviso, Ficha, fecha, fmt, Icono, iniciales, nuevaClave, Pastilla, Segmentos, Volver } from '../finanzas/comun'

/** «18.3 m», «12 pza». */
export function cantidad(q: number, unidad: string): string {
  const n = Number.isInteger(q) ? String(q) : q.toLocaleString('es-MX', { maximumFractionDigits: 3 })
  return `${n} ${abreviaturaUnidad(unidad)}`
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
    const r = await fetch(`/api/inventario/${ruta}${qs ? `?${qs}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
    return leer<T>(r)
  },
  async post<T>(ruta: string, cuerpo: unknown, clave?: string): Promise<T> {
    const r = await fetch(`/api/inventario/${ruta}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(clave ? { 'Idempotency-Key': clave } : {}) },
      body: JSON.stringify(cuerpo),
    })
    return leer<T>(r)
  },
}

/** Con `ruta` null no consulta nada (para cargas condicionales sin romper el orden de los hooks). */
export function useCarga<T>(ruta: string | null, params?: Record<string, string | number | null | undefined>) {
  const clave = `${ruta ?? ''}?${JSON.stringify(params ?? {})}`
  const [vuelta, setVuelta] = useState(0)
  const [estado, setEstado] = useState<{ clave: string; data: T | null; error: string | null }>({ clave: '', data: null, error: null })
  useEffect(() => {
    let vivo = true
    if (!ruta) return
    api
      .get<T>(ruta, params)
      .then((data) => vivo && setEstado({ clave, data, error: null }))
      .catch((e: Error) => vivo && setEstado({ clave, data: null, error: e.message }))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` ya resume ruta y parámetros
  }, [clave, vuelta])
  const vigente = estado.clave === clave
  return { data: estado.data, error: vigente ? estado.error : null, recargar: () => setVuelta((x) => x + 1) }
}

export type ContextoInventario = { catalogo: CatalogoInventario; base: string; rutaAdmin: string; soloCaptura: boolean }
export const InventarioCtx = createContext<ContextoInventario | null>(null)
export function useInventario(): ContextoInventario {
  const c = useContext(InventarioCtx)
  if (!c) throw new Error('Falta InventarioCtx')
  return c
}

export const NOMBRE_MOVIMIENTO: Record<string, string> = {
  entrada_compra: 'Entrada por compra',
  salida_obra: 'Salida a obra',
  traspaso: 'Traspaso',
  devolucion: 'Devolución',
  ajuste: 'Ajuste por conteo',
  merma: 'Merma',
  apertura: 'Existencia inicial',
}
