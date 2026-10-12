import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { es } from '@payloadcms/translations/languages/es'

import { site } from './lib/site'
import { resendEmailAdapter } from './lib/emailAdapter'

import { Users } from './collections/Users'
import { Roles } from './collections/Roles'
import { FinActividades, FinCategorias, FinConfiguracion, FinCuentas } from './collections/finanzas/catalogos'
import { FinBitacora, FinComprobantes, FinMovimientos, FinOperaciones } from './collections/finanzas/registros'
import { protegerColeccion, protegerGlobal } from './lib/permisos'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * ELGO Finanzas — réplica de Orthopedic Vet's Finanzas (a su vez réplica de
 * MacAuto Finanzas; Exkalibur, octubre de 2026) tropicalizada a una
 * constructora: cada peso se asigna a una obra o a un área de soporte.
 * Payload CMS embebido en Next.js, solo con usuarios, roles y Finanzas.
 *
 * Base de datos: PostgreSQL en Supabase (DATABASE_URL). Comprobantes: almacén
 * PRIVADO de Vercel Blob (FINANZAS_BLOB_READ_WRITE_TOKEN).
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    /* Tema claro fijo: la marca del panel (app/(payload)/custom.css) está pensada sobre fondo claro. */
    theme: 'light',
    /* Sin gravatar: el avatar de fábrica no llama a servicios externos. */
    avatar: 'default',
    meta: {
      titleSuffix: ` — ${site.brand.name}`,
      icons: [{ rel: 'icon', type: 'image/png', url: '/finanzas/favicon-64.png' }],
    },
    components: {
      graphics: {
        Logo: '/components/admin/Logo#default',
        Icon: '/components/admin/Icono#default',
      },
      beforeNavLinks: ['/components/admin/MarcaDelPanel#default'],
      beforeDashboard: ['/components/admin/Bienvenida#default'],
      views: {
        /**
         * Finanzas. Una sola vista para /admin/finanzas y todo lo que cuelga
         * de ahí (/registrar, /movimientos, /operacion/123…): sin `exact`,
         * Payload la usa para cualquier ruta que empiece así, y la vista
         * decide qué pantalla pintar. Quien solo captura la ve sin el menú.
         */
        finanzas: {
          Component: '/components/admin/finanzas/VistaFinanzas#default',
          path: '/finanzas',
        },
      },
      afterNavLinks: ['/components/admin/EnlaceFinanzas#default'],
    },
  },
  /**
   * `protegerColeccion` (lib/permisos.ts): quien entra solo a capturar recibe,
   * fuera de Finanzas, lo mismo que un visitante sin sesión. Se aplica a TODAS
   * para que una colección nueva quede protegida sin acordarse. Usuarios,
   * Roles y las de Finanzas traen sus propias reglas.
   */
  collections: [Users, Roles, FinCuentas, FinCategorias, FinActividades, FinOperaciones, FinMovimientos, FinComprobantes, FinBitacora].map(
    protegerColeccion,
  ),
  globals: [FinConfiguracion].map(protegerGlobal),
  /* Correo de recuperación de contraseña (Resend por HTTP). Sin RESEND_API_KEY no se envía nada. Ver lib/emailAdapter.ts. */
  email: resendEmailAdapter,
  i18n: {
    supportedLanguages: { es },
    fallbackLanguage: 'es',
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    /**
     * El esquema se versiona con migraciones (carpeta migrations/), no con el
     * «push» de modo desarrollo que usa MacAuto: así `npm run dev` nunca toca
     * la base por accidente. En producción, Payload aplica solo las
     * migraciones pendientes al arrancar (`prodMigrations`); no hay que correr
     * nada a mano. Ver docs/OPERACION.md.
     */
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
  }),
})
