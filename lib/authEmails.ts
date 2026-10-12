/**
 * Correos de autenticación del panel administrativo.
 *
 * De fábrica, Payload manda un correo en inglés genérico, sin la marca del
 * negocio y con la liga suelta en el texto. Este archivo lo sustituye por uno
 * en español mexicano, con el diseño de los demás correos del sistema y con la
 * vigencia dicha en voz alta.
 *
 * Se separa de lib/notify.ts a propósito: notify.ts son avisos del negocio
 * (leads, citas, seguimientos) y se dispara desde el código del sitio; esto son
 * correos de seguridad y los dispara Payload por su cuenta. Mezclarlos haría
 * que un cambio de plantilla comercial tocara un correo de seguridad.
 *
 * REPLICABILIDAD: no se nombra al negocio en ningún lado; todo sale de
 * lib/site.ts y de la configuración de Payload.
 */
import type { PayloadRequest } from 'payload'

import { site } from './site'

/** Escapa texto para meterlo en HTML de correo (copiado de lib/notify.ts de MacAuto). */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Vigencia de la liga de recuperación: una hora. */
export const VIGENCIA_RECUPERACION_MS = 60 * 60 * 1000

/**
 * De dónde sale el dominio de la liga.
 *
 * En producción se usa SIEMPRE la URL configurada del sitio, nunca el
 * encabezado `Host` de la petición. Esto no es un detalle: si se armara la liga
 * con el `Host` que manda el navegador, cualquiera podría pedir la
 * recuperación de una cuenta ajena falsificando ese encabezado, y a la persona
 * dueña de la cuenta le llegaría un correo legítimo con una liga hacia el
 * servidor del atacante. Al hacer clic, entregaría su token. Es un hueco
 * conocido ("host header injection") y aquí queda cerrado por construcción.
 *
 * En desarrollo sí se prefiere el origen de la petición, porque si no, probar
 * en localhost mandaría ligas apuntando al sitio de producción.
 */
function dominioBase(req?: PayloadRequest): string {
  if (process.env.NODE_ENV === 'production') return site.url

  const origen = req?.headers?.get?.('origin')?.trim()
  if (origen) return origen.replace(/\/$/, '')

  const host = req?.headers?.get?.('host')?.trim()
  if (host) {
    const protocolo = req?.headers?.get?.('x-forwarded-proto')?.trim() || 'http'
    return `${protocolo}://${host}`
  }

  return site.url
}

/** La dirección completa de la pantalla donde se captura la contraseña nueva. */
export function ligaDeRecuperacion(args: { req?: PayloadRequest; token?: string }): string {
  const config = args.req?.payload?.config
  const rutaPanel = config?.routes?.admin ?? '/admin'
  const rutaReset = config?.admin?.routes?.reset ?? '/reset'
  return `${dominioBase(args.req)}${rutaPanel}${rutaReset}/${args.token ?? ''}`
}

export function asuntoDeRecuperacion(): string {
  return `Restablece tu contraseña del panel de ${site.brand.name}`
}

/**
 * El cuerpo del correo.
 *
 * Decisiones de redacción, todas deliberadas:
 * - El botón y la liga en texto van juntos. Muchos clientes de correo
 *   corporativos bloquean los botones; sin la liga escrita, la persona se
 *   queda atorada.
 * - Se dice la vigencia ("una hora") en lugar de una fecha exacta: la fecha
 *   exigiría explicar zonas horarias y no ayuda a nadie.
 * - Se cierra con el aviso de "si no fuiste tú": es la única señal que tiene el
 *   equipo de que alguien está intentando entrar al panel.
 * - No lleva publicidad ni ligas al inventario. Es un correo de seguridad.
 */
export function htmlDeRecuperacion(args: {
  liga: string
  nombre?: string
}): string {
  const e = escapeHtml
  const saludo = args.nombre?.trim() ? `Hola ${e(args.nombre.trim())},` : 'Hola,'

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1A1A2E;max-width:560px">
      <p>${saludo}</p>
      <p>
        Recibimos una solicitud para restablecer la contraseña de tu cuenta del
        panel administrativo de <b>${e(site.brand.name)}</b>.
      </p>
      <p style="margin:24px 0">
        <a href="${e(args.liga)}" style="background:#123a34;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Crear una contraseña nueva
        </a>
      </p>
      <p style="color:#6B7280;font-size:14px">
        Si el botón no funciona, copia y pega esta dirección en tu navegador:<br>
        <span style="word-break:break-all">${e(args.liga)}</span>
      </p>
      <p style="color:#6B7280;font-size:14px">
        La liga sirve <b>una sola vez</b> y vence en <b>una hora</b>. Si se te
        pasa el tiempo, vuelve a pedirla desde la pantalla de inicio de sesión.
      </p>
      <p style="color:#6B7280;font-size:14px">
        <b>¿No fuiste tú?</b> Ignora este correo: tu contraseña sigue igual y
        nadie puede cambiarla sin esta liga. Si te llega varias veces, avísale
        al responsable del sitio.
      </p>
      <p style="margin-top:24px">— ${e(site.brand.name)}</p>
    </div>
  `
}
