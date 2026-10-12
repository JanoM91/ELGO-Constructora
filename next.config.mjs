import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* No hay sitio público: la raíz lleva directo a Finanzas (si no hay sesión, Payload pide la contraseña). */
  async redirects() {
    return [{ source: '/', destination: '/admin/finanzas', permanent: false }]
  },
}

export default withPayload(nextConfig)
