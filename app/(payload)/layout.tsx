/* Layout del panel administrativo (Payload CMS) */
import type { ServerFunctionClient } from 'payload'
import config from '@payload-config'
import '@payloadcms/next/css'
/* Marca del panel: va DESPUÉS del CSS de Payload para ganarle. Ver docs/58. */
import './custom.css'
/* Finanzas: usa los tokens --mx-* de custom.css, por eso va después. */
import './finanzas.css'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'

import { importMap } from './admin/importMap.js'

type Args = {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
