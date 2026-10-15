import { NextResponse } from 'next/server'
import { manifestPlataforma } from '@/lib/finanzas/appMovil'

/**
 * /manifest.webmanifest — ficha de instalación de la Plataforma ELGO (portada,
 * /admin y las apps que no tienen ficha propia). Se sirve sin sesión: el
 * teléfono la pide sin cookies. Finanzas usa /finanzas/manifest.webmanifest.
 */
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(manifestPlataforma(), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
