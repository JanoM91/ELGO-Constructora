/**
 * Avisos por correo de Finanzas (heredado de MacAuto, docs/63 de ese proyecto).
 *
 * Cuando alguien registra una entrada o un gasto con una categoría, obra o
 * área que no existe, se manda un correo a las personas que eligieron los
 * dueños en Finanzas → Configuración (o, si nadie está elegido, a los
 * superadministradores y a quienes pueden clasificar). Lleva la liga directa.
 *
 * Usa la misma API HTTP de Resend que el correo de «Olvidé mi contraseña»
 * (RESEND_API_KEY y LEADS_FROM_EMAIL). Si no están configuradas no truena
 * nada: el pendiente siempre se ve en Finanzas → Pendientes, que es el aviso
 * principal.
 */
import { site } from './site'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export async function notifyFinanzasRevision(args: {
  to: string[]
  folio: string
  tipo: 'entrada' | 'gasto'
  importe: string
  concepto: string
  capturadoPor: string
  fecha: string
  categoriaPropuesta?: string | null
  actividadPropuesta?: string | null
  ligaOperacion: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const fromEmail = process.env.LEADS_FROM_EMAIL?.trim()
  const to = [...new Set(args.to.map((c) => c.trim()).filter(Boolean))]
  if (!apiKey || !to.length || !fromEmail) {
    console.warn('[notify] aviso de Finanzas sin enviar: falta RESEND_API_KEY, LEADS_FROM_EMAIL o destinatarios')
    return
  }
  const e = escapeHtml
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${site.brand.name} Finanzas <${fromEmail}>`,
        to,
        subject: `Finanzas: clasificar ${args.folio}`,
        html: `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111317;max-width:560px">
            <p><b>${e(args.capturadoPor)}</b> registró ${args.tipo === 'entrada' ? 'una entrada' : 'un gasto'} que necesita tu revisión.</p>
            <p style="margin:0">${e(args.folio)} · ${e(args.fecha)} · <b>${e(args.importe)}</b></p>
            <p style="margin:4px 0 16px">${e(args.concepto)}</p>
            ${args.categoriaPropuesta ? `<p>No encontró la categoría y propuso: <b>«${e(args.categoriaPropuesta)}»</b>. Dala de alta o elige una existente.</p>` : ''}
            ${args.actividadPropuesta ? `<p>No encontró la obra o el área y propuso: <b>«${e(args.actividadPropuesta)}»</b>. Si es una obra nueva, dala de alta al clasificar.</p>` : ''}
            <p><a href="${args.ligaOperacion}">Clasificar ${e(args.folio)}</a></p>
          </div>
        `,
      }),
    })
    if (!res.ok) console.error('[notify] Resend respondió error en el aviso de Finanzas:', res.status, await res.text())
  } catch (err) {
    console.error('[notify] Falló el aviso de Finanzas:', err)
  }
}
