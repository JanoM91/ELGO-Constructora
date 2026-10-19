/**
 * Importa un lote de documentos de Inventario ya leídos y empatados (JSON).
 *
 *   npx payload run scripts/importarLote.ts -- ruta/al/lote.json [correo-de-quien-importa]
 *
 * Corre contra la base de DATABASE_URL (local para probar; nunca a ciegas en
 * producción). Todo entra en una sola transacción: si algo falla, no queda
 * nada a medias. Volver a correr el mismo lote no duplica documentos.
 * Ver lib/inventario/importacion.ts y docs/INVENTARIO.md.
 */
import { readFileSync } from 'fs'
import { commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction } from 'payload'
import config from '@payload-config'

import type { User } from '../payload-types'
import { permisosDe } from '../lib/permisos'
import { diaEnZona } from '../lib/finanzas/reglas'
import { site } from '../lib/site'
import { importarLote } from '../lib/inventario/importacion'

const args = process.argv.slice(2).filter((a) => a !== '--')
const [ruta, correo] = args
if (!ruta) {
  console.error('Uso: npx payload run scripts/importarLote.ts -- lote.json [correo]')
  process.exit(1)
}

const payload = await getPayload({ config })
const usuarios = await payload.find({
  collection: 'users', limit: 1, overrideAccess: true, depth: 0,
  where: correo ? { email: { equals: correo } } : { esSuperadmin: { equals: true } },
  sort: 'id',
})
const user = usuarios.docs[0] as User | undefined
if (!user) {
  console.error('No encontré la cuenta para firmar la importación.')
  process.exit(1)
}
const req = await createLocalReq({ user: user as User & { collection: 'users' } }, payload)
const p = await permisosDe(req)
const ctx = { payload, req, user, p, hoy: diaEnZona(new Date(), site.location.timeZone) }
const lote = JSON.parse(readFileSync(ruta, 'utf8'))

const inicio = Date.now()
await initTransaction(req)
try {
  const r = await importarLote(ctx, lote, req)
  await commitTransaction(req)
  console.log(JSON.stringify({ ...r, segundos: Math.round((Date.now() - inicio) / 1000), firmadoPor: user.email }, null, 2))
  process.exit(0)
} catch (e) {
  await killTransaction(req)
  console.error('No se importó nada:', (e as Error).message)
  process.exit(1)
}
