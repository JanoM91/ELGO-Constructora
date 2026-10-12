/**
 * Adaptador de correo de Payload, montado sobre la API HTTP de Resend.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Payload tiene su propio canal de correo, separado de lib/notify.ts. Lo usa
 * para los correos de autenticación: recuperación de contraseña, verificación
 * de cuenta y desbloqueo. Si `payload.config.ts` no le da un adaptador, Payload
 * carga en silencio el suyo de fábrica (`consoleEmailAdapter`), que **no manda
 * nada**: solo escribe en el log del servidor
 *
 *     "Email attempted without being configured. To: ..., Subject: ..."
 *
 * Eso es exactamente lo que estaba pasando con «Olvidé mi contraseña»: el
 * formulario respondía bien, el token se guardaba en la base, y el correo se
 * quedaba en el aire. Verificado en
 * node_modules/payload/dist/email/consoleEmailAdapter.js.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ POR HTTP Y NO CON NODEMAILER
 * ─────────────────────────────────────────────────────────────────────────────
 * El camino "oficial" es el paquete @payloadcms/email-nodemailer hablando SMTP.
 * Aquí no se usa por tres razones:
 *
 *  1. El proyecto ya manda todos sus correos por la API HTTP de Resend
 *     (lib/notify.ts). Dos caminos distintos hacia el mismo proveedor son dos
 *     cosas que pueden romperse por separado.
 *  2. SMTP mantiene conexiones abiertas; en funciones serverless eso da
 *     problemas de arranque en frío y de puertos. Un `fetch` no.
 *  3. Cero dependencias nuevas que mantener y actualizar.
 *
 * REPLICABILIDAD: nada de este archivo nombra al negocio. El remitente sale de
 * variables de entorno y el nombre visible, de lib/site.ts.
 */
import type { PayloadEmailAdapter, SendEmailOptions } from 'payload'

import { site } from './site'

type DireccionResend = string

/**
 * Payload (por herencia de Nodemailer) acepta el destinatario de varias formas:
 * un texto, un objeto `{ name, address }`, o un arreglo de cualquiera de las
 * dos. Resend solo entiende arreglos de texto, así que se normaliza aquí.
 */
function aDirecciones(valor: SendEmailOptions['to']): DireccionResend[] {
  if (!valor) return []
  const lista = Array.isArray(valor) ? valor : [valor]
  return lista
    .map((entrada) => {
      if (typeof entrada === 'string') return entrada.trim()
      if (entrada && typeof entrada === 'object' && 'address' in entrada) {
        const nombre = typeof entrada.name === 'string' ? entrada.name.trim() : ''
        const direccion = String(entrada.address).trim()
        return nombre ? `${nombre} <${direccion}>` : direccion
      }
      return ''
    })
    .filter((v): v is string => v.length > 0)
}

/** El HTML del correo puede llegar como texto o como Buffer, según quién lo arme. */
function aTexto(valor: unknown): string | undefined {
  if (typeof valor === 'string') return valor
  if (valor && typeof valor === 'object' && 'toString' in valor) return String(valor)
  return undefined
}

/**
 * En desarrollo, cuando no hay llave de Resend, imprime en la Terminal las
 * ligas que traía el correo. Sin esto no habría manera de probar el flujo de
 * recuperación en local sin mandar correos de verdad.
 *
 * Solo corre fuera de producción: una liga de restablecimiento en los logs de
 * producción sería una contraseña regalada a quien lea los logs.
 */
function ligasDelCorreo(html: string | undefined): string[] {
  if (!html) return []
  return Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1])
}

export const resendEmailAdapter: PayloadEmailAdapter = ({ payload }) => {
  const remitente = process.env.LEADS_FROM_EMAIL?.trim() || ''

  return {
    name: 'resend-http',
    /**
     * Se reutiliza el remitente de los demás correos del sistema porque su
     * dominio ya está verificado en Resend. Un remitente distinto exigiría
     * verificar otro dominio y no aportaría nada.
     */
    defaultFromAddress: remitente,
    defaultFromName: site.brand.name,

    sendEmail: async (mensaje: SendEmailOptions) => {
      const apiKey = process.env.RESEND_API_KEY?.trim()
      const para = aDirecciones(mensaje.to)
      const html = aTexto(mensaje.html)
      const asunto = typeof mensaje.subject === 'string' ? mensaje.subject : ''

      if (!apiKey || !remitente) {
        const falta = [!apiKey && 'RESEND_API_KEY', !remitente && 'LEADS_FROM_EMAIL']
          .filter(Boolean)
          .join(' y ')
        payload.logger.warn(
          `[correo] No se envió "${asunto}" a ${para.join(', ') || '(sin destinatario)'}: falta ${falta}.`,
        )
        if (process.env.NODE_ENV !== 'production') {
          for (const liga of ligasDelCorreo(html)) {
            payload.logger.info(`[correo] Liga que traía el correo (solo en desarrollo): ${liga}`)
          }
        }
        return
      }

      if (para.length === 0) {
        payload.logger.error(`[correo] No se envió "${asunto}": el correo no traía destinatario.`)
        return
      }

      const from = aTexto(mensaje.from) || `${site.brand.name} <${remitente}>`

      let respuesta: Response
      try {
        respuesta = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: para,
            subject: asunto,
            ...(html ? { html } : {}),
            ...(aTexto(mensaje.text) ? { text: aTexto(mensaje.text) } : {}),
          }),
        })
      } catch (e) {
        payload.logger.error(`[correo] Falló la conexión con Resend al enviar "${asunto}": ${String(e)}`)
        throw e
      }

      if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => '')
        payload.logger.error(
          `[correo] Resend rechazó "${asunto}" (HTTP ${respuesta.status}): ${detalle}`,
        )
        /**
         * Se propaga el error a propósito. Payload manda el correo DENTRO de la
         * transacción que acaba de guardar el token de recuperación: al tronar
         * aquí, la transacción se revierte y el token no queda escrito. Es lo
         * correcto — un token vivo cuya liga nunca llegó a nadie no le sirve a
         * la persona y sí amplía la superficie de ataque.
         *
         * Límite conocido: la pantalla del panel muestra el mismo mensaje
         * ("revisa tu correo") aunque esto falle, porque el formulario de
         * Payload no mira el código de respuesta. El fallo se ve en los logs
         * de Vercel, no en pantalla.
         */
        throw new Error(`Resend respondió ${respuesta.status} al enviar "${asunto}"`)
      }
    },
  }
}
