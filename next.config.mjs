import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * La raíz es la página pública de ELGO (app/(frontend)); el panel y todas
   * las aplicaciones del equipo viven en /admin.
   * La dirección anterior de Vercel lleva al dominio propio (las direcciones
   * de cada despliegue, elgo-finanzas-<id>-…vercel.app, no se tocan).
   */
  async redirects() {
    return [
      {
        source: '/:ruta*',
        has: [{ type: 'host', value: 'elgo-finanzas.vercel.app' }],
        destination: 'https://elgo-constructora.com/:ruta*',
        permanent: false,
      },
    ]
  },
}

export default withPayload(nextConfig)
