'use client'

/**
 * Foto de ticket (heredada de MacAuto Finanzas, docs/68 de ese proyecto).
 *
 * 1. La persona elige si es gasto o entrada y de dónde salió (o a dónde
 *    entró) el dinero — antes de la foto, por decisión de Jano: así cada
 *    registro descuenta de la caja correcta desde el primer momento.
 * 2. Toma la foto (o la elige de la galería). Se achica en el teléfono
 *    (lado mayor de 1600 px, JPEG) para que suba rápido y quepa en el límite
 *    de Vercel (4.5 MB por petición).
 * 3. El servidor lee el ticket y guarda UN registro por concepto, «por
 *    revisar». Aquí se muestran y se ofrece revisarlos ahora o después: al
 *    revisarlos se le asigna a cada concepto su obra.
 *
 * Si el ticket tiene varios conceptos pero se quiere registrar como UN solo
 * movimiento, se usa «Registrar gasto» y se adjunta la foto como comprobante:
 * ahí no se separa nada.
 */
import Link from 'next/link'
import React, { useRef, useState } from 'react'
import type { ResultadoTicket } from '../../../lib/finanzas/tipos'
import { api, Aviso, ErrorApi, Ficha, fmt, Icono, nuevaClave, Segmentos, useFinanzas, Volver } from './comun'

type Tipo = 'gasto' | 'entrada'
type Estado = 'realizado' | 'propio' | 'pendiente'
const LADO_MAX = 1600

/** Achica la foto en el teléfono. Si el navegador no puede (formato raro), manda la original si cabe. */
async function prepararFoto(f: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(f)
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * escala)
    const h = Math.round(bmp.height * escala)
    const lienzo = document.createElement('canvas')
    lienzo.width = w
    lienzo.height = h
    const g = lienzo.getContext('2d')
    if (!g) throw new Error('sin canvas')
    g.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.82))
    if (!blob) throw new Error('sin blob')
    return new File([blob], 'ticket.jpg', { type: 'image/jpeg' })
  } catch {
    if (/^image\/(jpeg|png|webp)$/i.test(f.type) && f.size < 4 * 1024 * 1024) return f
    throw new ErrorApi(400, 'No se pudo preparar la foto. Tómala de nuevo con la cámara.')
  }
}

export default function Ticket() {
  const { catalogo, base } = useFinanzas()
  const p = catalogo.permisos
  const [tipo, setTipo] = useState<Tipo>('gasto')
  const [estado, setEstado] = useState<Estado>('realizado')
  const [cuenta, setCuenta] = useState<number | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<ResultadoTicket | null>(null)
  const clave = useRef(nuevaClave())
  const entra = tipo === 'entrada'
  const listo = estado !== 'realizado' || cuenta != null

  async function elegida(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || leyendo) return
    setError(null)
    setLeyendo(true)
    try {
      const foto = await prepararFoto(f)
      const form = new FormData()
      form.append('tipo', tipo)
      form.append('estado', estado)
      if (estado === 'realizado' && cuenta) {
        form.append('cuenta', String(cuenta))
        const c = catalogo.cuentas.find((x) => x.id === cuenta)
        form.append('medio', c?.tipo === 'banco' ? 'transferencia' : 'efectivo')
      }
      form.append('foto', foto)
      setRes(await api.formulario<ResultadoTicket>('ticket', form, clave.current))
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar la foto. Revisa tu conexión: reintentar es seguro, no se duplica.')
    } finally {
      setLeyendo(false)
    }
  }

  function otro() {
    setRes(null); setError(null); clave.current = nuevaClave()
    window.scrollTo(0, 0)
  }

  if (!p.registrar) return <Aviso tono="info">Tu rol no incluye registrar entradas y gastos.</Aviso>

  if (res) {
    return (
      <div className="fz-stack">
        <div className="fz-listo">
          <span className="fz-listo__ok"><Icono n="check" /></span>
          <h2>{res.operaciones.length} {res.operaciones.length === 1 ? 'registro guardado' : 'registros guardados'}</h2>
          <p className="fz-tenue">{res.comercio || 'Ticket'} · {fmt(res.totalCentavos, true)}{res.duplicado ? ' · ya estaba guardado' : ''}</p>
        </div>
        {res.dudas.map((d, i) => <Aviso key={i} tono="aviso">{d}</Aviso>)}
        <div className="fz-tarjeta fz-lista">
          {res.operaciones.map((o) => (
            <Link key={o.id} className="fz-fila" href={`${base}/operacion/${o.id}`}>
              <span className="fz-fila__main"><span className="fz-fila__t1">{o.concepto}</span><span className="fz-fila__t2">{o.folio} · {o.categoria?.nombre ?? 'Sin categoría'} · sin obra</span></span>
              <span className="fz-monto">{fmt(o.totalCentavos, true)}</span>
            </Link>
          ))}
        </div>
        <Aviso tono="info">Quedaron <b>por completar</b>: revísalos cuando puedas (concepto, importe, categoría y obra). Los encuentras en Pendientes → Por completar.</Aviso>
        <div className="fz-acciones-fin">
          <Link className="fz-btn fz-btn--navy" href={`${base}/revisar?grupo=${encodeURIComponent(res.grupo)}`}>Revisarlos ahora</Link>
          <button type="button" className="fz-btn fz-btn--claro" onClick={otro}>Otro ticket</button>
          <Link className="fz-btn fz-btn--claro" href={base}>Después</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fz-stack">
      <Volver a={base} etiqueta="Inicio" />
      <div>
        <h1 className="fz-h1">Foto de ticket</h1>
        <p className="fz-ayuda">Se guarda <b>un registro por cada concepto</b> del ticket y luego los revisas con calma. ¿Prefieres un solo registro con el ticket como comprobante? Usa <Link className="fz-link" href={`${base}/registrar?tipo=${tipo}`}>Registrar {entra ? 'entrada' : 'gasto'}</Link>.</p>
      </div>
      <Segmentos<Tipo> etiqueta="Tipo" valor={tipo} alCambiar={(v) => { setTipo(v); if (v === 'entrada' && estado === 'propio') setEstado('realizado') }} opciones={[['gasto', 'Gasto · salió dinero'], ['entrada', 'Entrada · entró dinero']]} />
      <div className="fz-campo">
        <span className="fz-etiqueta">¿Ya {entra ? 'se cobró' : 'se pagó'}?</span>
        <Segmentos<Estado> etiqueta="Estado" valor={estado} alCambiar={setEstado}
          opciones={entra ? [['realizado', 'Sí, ya entró'], ['pendiente', 'Por cobrar']] : [['realizado', 'Sí, ya salió'], ['propio', 'De mi bolsa'], ['pendiente', 'Por pagar']]} />
      </div>
      {estado === 'realizado' && (
        <div className="fz-campo">
          <span className="fz-etiqueta">{entra ? '¿A qué cuenta o caja entró?' : '¿De qué cuenta o caja salió?'}</span>
          <div className="fz-chips">{catalogo.cuentas.map((c) => <Ficha key={c.id} activa={cuenta === c.id} onClick={() => setCuenta(c.id)}>{c.nombre}</Ficha>)}</div>
        </div>
      )}
      {estado === 'propio' && <p className="fz-ayuda">Cada concepto queda <b>por reembolsar</b> a tu nombre.</p>}
      {estado === 'pendiente' && <p className="fz-ayuda">Cada concepto queda {entra ? 'por cobrar' : 'por pagar'}; no cambia el dinero disponible hasta que se {entra ? 'cobre' : 'pague'}.</p>}

      {error && <Aviso tono="malo">{error}</Aviso>}
      {leyendo ? (
        <div className="fz-tarjeta fz-pad fz-centro fz-stack fz-stack--chico">
          <span className="fz-cargando" aria-hidden="true" />
          <b>Leyendo el ticket…</b>
          <span className="fz-ayuda">Toma de 10 a 30 segundos. No cierres la app.</span>
        </div>
      ) : (
        <div className="fz-acciones">
          <label className={`fz-accion fz-accion--navy${listo ? '' : ' is-pronto'}`} aria-disabled={!listo}>
            <span className="fz-accion__ico"><Icono n="camara" /></span>
            <span>Tomar foto del ticket<small>{listo ? 'De frente, con buena luz y completo' : 'Primero elige la cuenta'}</small></span>
            <input type="file" accept="image/*" capture="environment" onChange={elegida} disabled={!listo} hidden />
          </label>
          <label className={`fz-accion fz-accion--claro${listo ? '' : ' is-pronto'}`} aria-disabled={!listo}>
            <span className="fz-accion__ico"><Icono n="clip" /></span>
            <span>Elegir de la galería<small>Una foto que ya tomaste</small></span>
            <input type="file" accept="image/*" onChange={elegida} disabled={!listo} hidden />
          </label>
        </div>
      )}
    </div>
  )
}
