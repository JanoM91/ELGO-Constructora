/* Layout de la página pública (elgo-constructora.com). El panel y las
   aplicaciones del equipo viven en /admin, con su propio layout. */
import type { Metadata, Viewport } from 'next'
import React from 'react'

import { landing } from '../../lib/landing'
import { site } from '../../lib/site'
import './landing.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: `${site.brand.name} · ${landing.nombreCompleto}`,
  description: `${landing.titulo}. ${landing.ciudad}.`,
  icons: {
    icon: [{ url: '/finanzas/favicon-64.png', type: 'image/png', sizes: '64x64' }],
    apple: [{ url: '/finanzas/apple-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: `${site.brand.name} · ${landing.nombreCompleto}`,
    description: `${landing.titulo}. ${landing.ciudad}.`,
    locale: 'es_MX',
    type: 'website',
    images: [{ url: '/logo-elgo.png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#2e2c2a',
  width: 'device-width',
  initialScale: 1,
}

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body className="lp">{children}</body>
    </html>
  )
}
