'use client'

/**
 * Completar lo que se guardó solo (heredado de MacAuto, docs/68): los
 * conceptos de una foto de ticket o un plan de pagos que quedó sin clasificar.
 * Quien lo capturó ajusta concepto, importe (si la foto se leyó mal),
 * categoría y obra, y lo marca
 * como revisado. Un renglón que no era un concepto se descarta (se anula con
 * motivo; nada se borra).
 *
 *   /finanzas/revisar?grupo=TKT-000123   los conceptos de un ticket
 *   /finanzas/revisar?op=123             un solo registro
 *   /finanzas/revisar                    todo lo que tengo por completar
 */
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { aCentavos } from '../../../lib/finanzas/reglas'
import type { DetalleOperacion, OperacionVista } from '../../../lib/finanzas/tipos'
import { type Clasif, clasifDe, cuerpoClasif, EditorClasificacion, errorClasif } from './clasificacion'
import { api, Aviso, ErrorApi, fmt, Icono, Pastilla, useFinanzas, Volver } from './comun'

type Edicion = { concepto: string; importe: string; clasif: Clasif }

function Tarjeta({ op, abierta, alAbrir, alCambiar }: { op: OperacionVista; abierta: boolean; alAbrir: () => void; alCambiar: (aviso: string) => void }) {
  const { catalogo, base } = useFinanzas()
  const editable = op.porRevisar || catalogo.permisos.corregir
  const [ed, setEd] = useState<Edicion>(() => ({ concepto: op.concepto, importe: (op.totalCentavos / 100).toFixed(2), clasif: clasifDe(op) }))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [descartando, setDescartando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const tipo = op.tipo === 'entrada' ? 'entrada' : 'gasto'

  async function guardar() {
    const centavos = aCentavos(ed.importe)
    if (!Number.isInteger(centavos) || centavos <= 0) return setError('Escribe un importe mayor a cero.')
    if (!ed.concepto.trim()) return setError('Escribe un concepto.')
    const e = errorClasif(ed.clasif)
    if (e) return setError(e)
    setEnviando(true); setError(null)
    try {
      const pesos = (centavos / 100).toFixed(2)
      await api.post(`operaciones/${op.id}/completar`, { concepto: ed.concepto.trim(), ...(op.calendario ? {} : { importe: pesos }), ...cuerpoClasif(ed.clasif), listo: true })
      alCambiar(`${op.folio} quedó revisado.`)
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }
  async function descartar() {
    setEnviando(true); setError(null)
    try {
      await api.post(`operaciones/${op.id}/descarte`, { motivo })
      alCambiar(`${op.folio} se descartó (queda anulado en el historial).`)
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo descartar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className={`fz-revisar${op.porRevisar ? '' : ' is-hecho'}`}>
      <button type="button" className="fz-revisar__cab" onClick={alAbrir} aria-expanded={abierta}>
        <span className="fz-fila__main">
          <span className="fz-fila__t1">{op.concepto}</span>
          <span className="fz-fila__t2">{op.folio} · {op.categoria?.nombre ?? (op.categoriaPropuesta ? `Propuso «${op.categoriaPropuesta}»` : 'Sin categoría')} · {op.asignacion === 'actividad' ? op.actividad?.nombre ?? 'Obra' : op.asignacion === 'general' ? 'General' : op.actividadPropuesta ? `Propuso «${op.actividadPropuesta}»` : 'Sin obra'}</span>
          <span className="fz-fila__pills">{op.porRevisar ? <Pastilla tono="aviso">Por completar</Pastilla> : <Pastilla tono="ok">Revisado</Pastilla>}</span>
        </span>
        <span className="fz-monto">{fmt(op.totalCentavos, true)}</span>
      </button>
      {abierta && editable && (
        <div className="fz-stack fz-stack--chico">
          <label className="fz-campo"><span className="fz-etiqueta">Concepto</span><input className="fz-input" value={ed.concepto} maxLength={160} onChange={(e) => setEd({ ...ed, concepto: e.target.value })} /></label>
          {op.calendario ? <p className="fz-ayuda">Importe del plan: {fmt(op.totalCentavos, true)} (para cambiarlo, anula el plan y regístralo de nuevo).</p> : (
            <label className="fz-campo"><span className="fz-etiqueta">Importe <span className="fz-opcional">corrígelo si la foto se leyó mal</span></span>
              <span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={ed.importe} onChange={(e) => setEd({ ...ed, importe: e.target.value })} /></span></label>
          )}
          <EditorClasificacion tipo={tipo} valor={ed.clasif} alCambiar={(clasif) => setEd({ ...ed, clasif })} />
          {error && <Aviso tono="malo">{error}</Aviso>}
          {descartando ? (
            <div className="fz-nuevo">
              <span className="fz-etiqueta fz-etiqueta--sub">¿Por qué lo descartas?</span>
              <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. No era un concepto, era el subtotal" aria-label="Motivo" />
              <div className="fz-chips">
                <button type="button" className="fz-btn fz-btn--peligro fz-btn--chico" disabled={enviando || motivo.trim().length < 5} onClick={descartar}>{enviando ? 'Descartando…' : 'Descartar'}</button>
                <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => setDescartando(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="fz-acciones-fin">
              <button type="button" className="fz-btn fz-btn--navy" disabled={enviando} onClick={guardar}>{enviando ? 'Guardando…' : 'Guardar como revisado'}</button>
              {op.porRevisar && <button type="button" className="fz-btn fz-btn--claro" onClick={() => setDescartando(true)}>Descartar</button>}
              <Link className="fz-btn fz-btn--claro" href={`${base}/operacion/${op.id}`}>Ver detalle</Link>
            </div>
          )}
        </div>
      )}
      {abierta && !editable && <p className="fz-ayuda">Ya se revisó. Si algo está mal, pide a administración que lo corrija. <Link className="fz-link" href={`${base}/operacion/${op.id}`}>Ver detalle</Link></p>}
    </div>
  )
}

export default function Revisar({ grupo, opId }: { grupo: string | null; opId: number | null }) {
  const { base } = useFinanzas()
  const [ops, setOps] = useState<OperacionVista[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    const pedir = opId ? api.get<DetalleOperacion>(`operaciones/${opId}`).then((d) => [d.operacion]) : api.get<OperacionVista[]>('por-completar', { grupo })
    pedir
      .then((lista) => {
        if (!vivo) return
        setOps(lista)
        setError(null)
        setAbierta((x) => x ?? lista.find((o) => o.porRevisar)?.id ?? null)
      })
      .catch((e: Error) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [grupo, opId, vuelta])

  const pendientes = (ops ?? []).filter((o) => o.porRevisar)
  const total = (ops ?? []).reduce((a, o) => a + o.totalCentavos, 0)
  const titulo = grupo ? `Ticket ${ops?.[0]?.contraparte ? `de ${ops[0].contraparte}` : grupo}` : opId ? 'Completar registro' : 'Por completar'
  return (
    <div className="fz-stack">
      <Volver a={`${base}/pendientes?ver=por-completar`} etiqueta="Pendientes" />
      <div>
        <h1 className="fz-h1">{titulo}</h1>
        {ops && <p className="fz-ayuda">{grupo ? `${ops.length} conceptos · ${fmt(total, true)} · ` : ''}{pendientes.length ? `${pendientes.length} por completar. Toca cada uno, ajusta lo que haga falta y guárdalo.` : 'Todo revisado.'}</p>}
      </div>
      {aviso && <Aviso tono="ok">{aviso}</Aviso>}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!ops && !error && <div className="fz-tarjeta fz-vacio">Cargando…</div>}
      {ops && !ops.length && <div className="fz-tarjeta fz-vacio"><Icono n="check" /> Nada por completar.</div>}
      {ops && ops.length > 0 && (
        <div className="fz-tarjeta fz-lista">
          {ops.map((o) => (
            <Tarjeta key={`${o.id}-${o.porRevisar}-${vuelta}`} op={o} abierta={abierta === o.id} alAbrir={() => setAbierta(abierta === o.id ? null : o.id)}
              alCambiar={(t) => { setAviso(t); setAbierta(null); setVuelta((v) => v + 1) }} />
          ))}
        </div>
      )}
    </div>
  )
}
