import type { Metadata, Viewport } from 'next'
import config from '@payload-config'
import { generatePageMetadata, RootPage } from '@payloadcms/next/views'
import { importMap } from '../importMap.js'
import {
  esRutaDeFinanzas,
  metadatosFinanzas,
  metadatosPlataforma,
  viewportFinanzas,
  viewportPlataforma,
} from '@/lib/finanzas/appMovil'

type Args = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<{ [key: string]: string | string[] }>
}

/**
 * Metadatos del panel: los de Payload más lo que hace falta para instalarlo
 * como app en el celular (manifest, icono de iPhone, nombre corto). Finanzas
 * lleva su propia ficha; el resto del panel, la de la Plataforma ELGO. Ver
 * lib/finanzas/appMovil.ts.
 */
export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => {
  const base = await generatePageMetadata({ config, params, searchParams })
  const [{ segments }, query] = await Promise.all([params, searchParams])
  return { ...base, ...(esRutaDeFinanzas(segments, query) ? metadatosFinanzas() : metadatosPlataforma()) }
}

/** Color de la barra de estado del teléfono (y bordes en Finanzas). */
export const generateViewport = async ({ params, searchParams }: Args): Promise<Viewport> => {
  const [{ segments }, query] = await Promise.all([params, searchParams])
  return esRutaDeFinanzas(segments, query) ? viewportFinanzas : viewportPlataforma
}

const Page = ({ params, searchParams }: Args) =>
  RootPage({ config, params, searchParams, importMap })

export default Page
