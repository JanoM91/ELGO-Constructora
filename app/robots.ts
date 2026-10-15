import type { MetadataRoute } from 'next'

/* La portada se puede indexar; el panel, la API y las aplicaciones no. */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/finanzas'] }],
    host: base,
  }
}
