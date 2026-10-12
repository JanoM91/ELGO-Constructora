import type { Metadata, Viewport } from 'next'
import { site } from '../site'

/**
 * Finanzas como «app» en el celular (heredado de MacAuto Finanzas, docs/61).
 *
 * Finanzas se usa desde el teléfono: cada persona la agrega a su pantalla de
 * inicio. Para que ese icono se vea como una app de verdad (logo oficial,
 * nombre «Finanzas», sin barra del navegador) el HTML de sus páginas lleva:
 *
 *   - un manifest (app/finanzas/manifest.webmanifest/route.ts), que es lo que
 *     leen Android/Chrome y el iPhone (iOS 16.4+) al instalar;
 *   - el apple-touch-icon y apple-mobile-web-app-title, que es lo que leía el
 *     iPhone desde siempre;
 *   - theme-color (color de la barra de estado) y viewport-fit=cover (para
 *     poder pintar hasta los bordes del teléfono, respetando la muesca).
 *
 * Nada de esto se mete en todo el panel: solo en las rutas de Finanzas y en
 * la pantalla de inicio de sesión cuando se llegó desde Finanzas (sesión
 * vencida o primer acceso), que es donde una persona puede tocar «Agregar a
 * pantalla de inicio». Así el panel completo y el sitio público no cambian.
 *
 * Este archivo es puro: decide y describe, no toca Payload. Lo usa
 * app/(payload)/admin/[[...segments]]/page.tsx.
 *
 * REPLICABILIDAD: nombre desde lib/site.ts; el color es el primario oscuro de
 * la marca (el mismo --mx-navy de custom.css, aquí azul marino). Para otro
 * negocio se cambian los PNG de public/finanzas/ y, si hace falta, este color.
 */

/** Primario oscuro de la marca: barra de estado del teléfono y fondo de la pantalla de arranque. */
export const COLOR_APP = '#13294b'

export const RUTA_MANIFEST = '/finanzas/manifest.webmanifest'

/** Nombre corto: es lo que aparece debajo del icono (el iPhone corta a ~12 letras). */
export const NOMBRE_CORTO = 'Finanzas'

export const ICONOS = {
  favicon: '/finanzas/favicon-64.png',
  apple: '/finanzas/apple-icon.png',
  chico: '/finanzas/icon-192.png',
  grande: '/finanzas/icon-512.png',
  chicoMaskable: '/finanzas/icon-maskable-192.png',
  grandeMaskable: '/finanzas/icon-maskable-512.png',
} as const

type Query = Record<string, string | string[] | undefined> | undefined

/**
 * ¿Esta página del panel es de Finanzas?
 *
 * `segments` son los pedazos de la URL después de /admin. Cuenta como Finanzas
 * todo lo que empieza en /admin/finanzas y, además, /admin/login cuando trae
 * `redirect` hacia Finanzas (ahí cae quien abre el icono con la sesión vencida).
 */
export function esRutaDeFinanzas(segments: string[] | undefined, query: Query): boolean {
  const s = Array.isArray(segments) ? segments : []
  if (s[0] === 'finanzas') return true
  if (s[0] === 'login') {
    const r = query?.redirect
    const destino = Array.isArray(r) ? r[0] : r
    return typeof destino === 'string' && /^\/[^/?]+\/finanzas(\/|\?|$)/.test(destino)
  }
  return false
}

/** Lo que se agrega (o se cambia) sobre los metadatos que ya genera Payload. */
export function metadatosFinanzas(): Metadata {
  const nombre = `${site.brand.name} ${NOMBRE_CORTO}`
  return {
    title: `${NOMBRE_CORTO} — ${site.brand.name}`,
    applicationName: nombre,
    manifest: RUTA_MANIFEST,
    appleWebApp: {
      capable: true,
      title: NOMBRE_CORTO,
      /* `default`: la página empieza debajo de la barra de estado y esa barra
         toma el theme-color (navy). Con `black-translucent` la página se
         metería debajo de la hora y la batería, y el panel completo (encabezado
         blanco) se vería mal. */
      statusBarStyle: 'default',
    },
    icons: {
      icon: [{ url: ICONOS.favicon, type: 'image/png', sizes: '64x64' }],
      apple: [{ url: ICONOS.apple, type: 'image/png', sizes: '180x180' }],
    },
    /* Next solo escribe `mobile-web-app-capable`; los iPhone con iOS viejo solo
       entienden la etiqueta con prefijo apple-. */
    other: { 'apple-mobile-web-app-capable': 'yes' },
  }
}

/** Viewport de Finanzas: igual al de siempre más el color de la barra y los bordes. */
export const viewportFinanzas: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: COLOR_APP,
}

/** El manifest que leen Android/Chrome y el iPhone al instalar. */
export function manifestFinanzas() {
  return {
    id: '/admin/finanzas',
    name: `${site.brand.name} ${NOMBRE_CORTO}`,
    short_name: NOMBRE_CORTO,
    description: `Registro de entradas, gastos y compromisos de ${site.brand.name}.`,
    lang: 'es-MX',
    start_url: '/admin/finanzas',
    /* El alcance incluye /admin/login y /admin/logout: así, cuando la sesión
       vence, la pantalla de contraseña se abre DENTRO de la app y no en el
       navegador. */
    scope: '/admin/',
    display: 'standalone',
    background_color: COLOR_APP,
    theme_color: COLOR_APP,
    categories: ['business', 'finance', 'medical'],
    icons: [
      { src: ICONOS.chico, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: ICONOS.grande, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: ICONOS.chicoMaskable, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: ICONOS.grandeMaskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
