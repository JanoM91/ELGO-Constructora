import type { Metadata, Viewport } from 'next'
import config from '@payload-config'
import { generatePageMetadata, RootPage } from '@payloadcms/next/views'
import { importMap } from '../importMap.js'
import { esRutaDeFinanzas, metadatosFinanzas, viewportFinanzas } from '@/lib/finanzas/appMovil'

type Args = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] }>
}

/**
 * Metadatos del panel: los de Payload y, solo en las páginas de
 * Finanzas, lo que hace falta para instalarla como app en el celular
 * (manifest, icono de iPhone, nombre corto). Ver lib/finanzas/appMovil.ts.
 */
export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => {
  const base = await generatePageMetadata({ config, params, searchParams })
  const [{ segments }, query] = await Promise.all([params, searchParams])
  return esRutaDeFinanzas(segments, query) ? { ...base, ...metadatosFinanzas() } : base
}

/** Color de la barra de estado y bordes del teléfono, solo en Finanzas. */
export const generateViewport = async ({ params, searchParams }: Args): Promise<Viewport> => {
  const [{ segments }, query] = await Promise.all([params, searchParams])
  return esRutaDeFinanzas(segments, query) ? viewportFinanzas : {}
}

const Page = ({ params, searchParams }: Args) =>
  RootPage({ config, params, searchParams, importMap })

export default Page
