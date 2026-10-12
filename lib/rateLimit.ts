/**
 * Rate limiting simple en memoria (ventana deslizante).
 * Suficiente para el arranque; migrar a Upstash Redis si el tráfico crece
 * (múltiples instancias serverless no comparten memoria).
 */

const buckets = new Map<string, number[]>()

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= max) {
    buckets.set(key, hits)
    return false // bloqueado
  }
  hits.push(now)
  buckets.set(key, hits)
  // Limpieza ocasional para no crecer sin límite
  if (buckets.size > 5000) buckets.clear()
  return true
}
