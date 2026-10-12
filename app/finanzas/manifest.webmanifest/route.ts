import { NextResponse } from 'next/server'
import { manifestFinanzas } from '@/lib/finanzas/appMovil'

/**
 * /finanzas/manifest.webmanifest — la «ficha de instalación» de Finanzas
 * (heredada de MacAuto Finanzas, docs/61). Android/Chrome y el iPhone la leen al agregar el icono a
 * la pantalla de inicio: nombre, icono, color y en qué página abre.
 *
 * Es una ruta y no un archivo en public/ para que el nombre salga de
 * lib/site.ts, igual que el resto de la identidad. Se sirve sin sesión: el
 * teléfono la pide sin cookies.
 */
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(manifestFinanzas(), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
