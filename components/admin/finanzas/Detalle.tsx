'use client'

/**
 * Detalle de una operación: sus cobros o pagos, comprobantes, historial y,
 * según el rol, las acciones para liquidar, corregir, clasificar o anular.
 * Nada se borra: cada cambio queda en la bitácora con su motivo.
 */
import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { aCentavos } from '../../../lib/finanzas/reglas'
import type { DetalleOperacion } from '../../../lib/finanzas/tipos'
import { api, Aviso, esInterno, fecha, Ficha, fmt, Icono, momento, NOMBRE_INTERNO, nuevaClave, pastillasDe, Pastilla, Segmentos, signoDe, useFinanzas, Volver } from './comun'

type Modo = null | 'pago' | 'corregir' | 'clasificar' | 'anular'
const ACCION: Record<string, string> = { crear: 'Registró', corregir: 'Corrigió', clasificar: 'Clasificó', anular: 'Anuló', cobro: 'Registró un cobro', pago: 'Registró un pago', comprobante: 'Subió comprobante', revision: 'Revisó comprobante' }

export default function Detalle({ id }: { id: number }) {
  const { catalogo, base } = useFinanzas()
  const [d, setD] = useState<DetalleOperacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [errForm, setErrForm] = useState<string | null>(null)
  const clave = useRef(nuevaClave())

  // formularios
  const [pago, setPago] = useState({ importe: '', cuenta: null as number | null, medio: 'efectivo', fecha: catalogo.hoy })
  const [cor, setCor] = useState({ importe: '', fechaReal: '', concepto: '', categoria: '', contraparte: '', cuenta: '', motivo: '' })
  const [cla, setCla] = useState({ categoria: null as number | null, asignacion: 'general' as 'actividad' | 'general', actividad: null as number | null })
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(() => {
    api.get<DetalleOperacion>(`operaciones/${id}`).then((r) => { setD(r); setError(null) }).catch((e: Error) => setError(e.message))
  }, [id])
  useEffect(cargar, [cargar])

  function abrir(m: Modo) {
    setModo(m); setErrForm(null); clave.current = nuevaClave()
    if (!d) return
    const op = d.operacion
    if (m === 'pago') setPago({ importe: '', cuenta: null, medio: 'efectivo', fecha: catalogo.hoy })
    if (m === 'corregir') setCor({ importe: (op.totalCentavos / 100).toFixed(2), fechaReal: op.fechaReal, concepto: op.concepto, categoria: op.categoria ? String(op.categoria.id) : '', contraparte: op.contraparte, cuenta: '', motivo: '' })
    if (m === 'clasificar') setCla({ categoria: op.categoria?.id ?? null, asignacion: op.actividad ? 'actividad' : 'general', actividad: op.actividad?.id ?? null })
    if (m === 'anular') setMotivo('')
  }

  async function enviar(fn: () => Promise<unknown>, ok: string) {
    if (enviando) return
    setEnviando(true); setErrForm(null)
    try {
      await fn()
      setModo(null); setAviso(ok); cargar()
    } catch (e) {
      setErrForm((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    await enviar(() => api.subir(`operaciones/${id}/comprobantes`, f, nuevaClave()), 'Comprobante subido. Queda por revisar.')
  }

  if (error) return <div className="fz-stack"><Aviso tono="malo">{error}</Aviso><Link className="fz-link" href={`${base}/movimientos`}>Volver a movimientos</Link></div>
  if (!d) return <div className="fz-tarjeta fz-vacio">Cargando…</div>
  const op = d.operacion
  const entra = op.tipo === 'entrada'
  const interno = esInterno(op.tipo)
  const reembolso = op.pagadoCon === 'propio'
  const { signo, clase } = signoDe(op)
  const cats = catalogo.categorias.filter((c) => c.tipo === op.tipo)
  const quien = op.reembolsoA?.nombre.split(' ')[0] ?? 'la persona'

  return (
    <div className="fz-stack">
      {/* Desde el icono del celular no hay botón «atrás» del navegador (docs/61). */}
      <Volver a={`${base}/movimientos`} etiqueta="Volver" />
      <div className="fz-stack fz-stack--chico">
        <div className="fz-fila__pills"><Pastilla tono="gris">{interno ? NOMBRE_INTERNO[op.tipo] : entra ? 'Entrada' : 'Gasto'} · {op.folio}</Pastilla>{pastillasDe(op)}</div>
        <div className={`fz-monto-grande${clase}${op.anulada ? ' is-anulado' : ''}`}>{signo}{fmt(op.totalCentavos, true)}</div>
        <h2 className="fz-h2">{op.concepto}</h2>
        {op.tipo === 'traspaso' && op.traspaso && <p className="fz-ayuda">De <b>{op.traspaso.de}</b> a <b>{op.traspaso.a}</b>. No cuenta como entrada ni gasto.</p>}
        {(op.tipo === 'aportacion' || op.tipo === 'retiro') && <p className="fz-ayuda">{op.tipo === 'aportacion' ? 'Dinero que metió un socio' : 'Dinero que sacó un socio'}{op.contraparte ? ` (${op.contraparte})` : ''}. No cuenta en el resultado del negocio.</p>}
        {reembolso && !op.anulada && <p className="fz-ayuda">Lo pagó <b>{op.reembolsoA?.nombre ?? 'alguien'}</b> de su bolsa. {op.pendienteCentavos > 0 ? `Falta reembolsarle ${fmt(op.pendienteCentavos, true)}.` : 'Ya se le reembolsó.'}</p>}
        {op.anulada && <Aviso tono="malo">Anulado. Motivo: {op.motivoAnulacion}</Aviso>}
        {aviso && <Aviso tono="ok">{aviso}</Aviso>}
      </div>

      {modo === 'pago' && (
        <div className="fz-tarjeta fz-pad fz-stack">
          <h3>{reembolso ? `Registrar reembolso a ${quien}` : entra ? 'Registrar cobro' : 'Registrar pago'}</h3>
          <label className="fz-campo"><span className="fz-etiqueta">Importe <span className="fz-opcional">pendiente {fmt(op.pendienteCentavos, true)}</span></span>
            <span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={pago.importe} onChange={(e) => setPago({ ...pago, importe: e.target.value })} /></span></label>
          <div className="fz-chips"><Ficha onClick={() => setPago({ ...pago, importe: (op.pendienteCentavos / 100).toFixed(2) })}>Todo el saldo: {fmt(op.pendienteCentavos, true)}</Ficha></div>
          <div className="fz-campo"><span className="fz-etiqueta">{entra ? '¿A qué cuenta entró?' : reembolso ? '¿De qué cuenta o caja sale el reembolso?' : '¿De qué cuenta salió?'}</span>
            <div className="fz-chips">{catalogo.cuentas.map((c) => <Ficha key={c.id} activa={pago.cuenta === c.id} onClick={() => setPago({ ...pago, cuenta: c.id, medio: c.tipo === 'banco' ? 'transferencia' : 'efectivo' })}>{c.nombre}</Ficha>)}</div></div>
          <Segmentos etiqueta="Medio" valor={pago.medio} alCambiar={(v) => setPago({ ...pago, medio: v })} opciones={[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['cheque', 'Cheque']]} />
          <label className="fz-campo"><span className="fz-etiqueta">Fecha real</span><input className="fz-input fz-input--fecha" type="date" value={pago.fecha} max={catalogo.hoy} min={catalogo.fechaCorte ?? undefined} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} /></label>
          {errForm && <Aviso tono="malo">{errForm}</Aviso>}
          <div className="fz-acciones-fin">
            <button type="button" className="fz-btn fz-btn--teal" disabled={enviando || !pago.cuenta || !(aCentavos(pago.importe) > 0)} onClick={() => enviar(() => api.post(`operaciones/${id}/pagos`, { importe: pago.importe, cuenta: pago.cuenta, medio: pago.medio, fechaReal: pago.fecha }, clave.current), reembolso ? 'Reembolso registrado.' : 'Registrado. El saldo pendiente se actualizó.')}>{enviando ? 'Guardando…' : reembolso ? 'Guardar reembolso' : 'Guardar'}</button>
            <button type="button" className="fz-btn fz-btn--claro" onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {modo === 'corregir' && (
        <div className="fz-tarjeta fz-pad fz-stack">
          <h3>Corregir {op.folio}</h3>
          <p className="fz-ayuda">Se guarda el valor anterior, el nuevo, quién lo cambió, cuándo y por qué.</p>
          <label className="fz-campo"><span className="fz-etiqueta">Importe</span><span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={cor.importe} onChange={(e) => setCor({ ...cor, importe: e.target.value })} /></span></label>
          <label className="fz-campo"><span className="fz-etiqueta">Fecha real</span><input className="fz-input fz-input--fecha" type="date" value={cor.fechaReal} max={catalogo.hoy} onChange={(e) => setCor({ ...cor, fechaReal: e.target.value })} /></label>
          <label className="fz-campo"><span className="fz-etiqueta">Concepto</span><input className="fz-input" value={cor.concepto} onChange={(e) => setCor({ ...cor, concepto: e.target.value })} /></label>
          <label className="fz-campo"><span className="fz-etiqueta">Categoría</span>
            <select className="fz-input" value={cor.categoria} onChange={(e) => setCor({ ...cor, categoria: e.target.value })}><option value="">Sin clasificar</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          {d.movimientos.filter((m) => !m.anulado).length === 1 && (
            <label className="fz-campo"><span className="fz-etiqueta">Cuenta</span>
              <select className="fz-input" value={cor.cuenta} onChange={(e) => setCor({ ...cor, cuenta: e.target.value })}><option value="">Sin cambio ({d.movimientos.find((m) => !m.anulado)?.cuenta.nombre})</option>{catalogo.cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          )}
          <label className="fz-campo"><span className="fz-etiqueta">Contraparte</span><input className="fz-input" value={cor.contraparte} onChange={(e) => setCor({ ...cor, contraparte: e.target.value })} /></label>
          <label className="fz-campo"><span className="fz-etiqueta">Motivo de la corrección</span><input className="fz-input" value={cor.motivo} onChange={(e) => setCor({ ...cor, motivo: e.target.value })} placeholder="Ej. El recibo dice otra cantidad" /></label>
          {errForm && <Aviso tono="malo">{errForm}</Aviso>}
          <div className="fz-acciones-fin">
            <button type="button" className="fz-btn fz-btn--navy" disabled={enviando} onClick={() => enviar(() => api.post(`operaciones/${id}/correccion`, {
              motivo: cor.motivo, importe: cor.importe, fechaReal: cor.fechaReal, concepto: cor.concepto, contraparte: cor.contraparte,
              categoria: cor.categoria ? Number(cor.categoria) : null, ...(cor.cuenta ? { cuenta: Number(cor.cuenta) } : {}),
            }), 'Corrección guardada en el historial.')}>{enviando ? 'Guardando…' : 'Guardar corrección'}</button>
            <button type="button" className="fz-btn fz-btn--claro" onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {modo === 'clasificar' && (
        <div className="fz-tarjeta fz-pad fz-stack">
          <h3>Clasificar {op.folio}</h3>
          <div className="fz-campo"><span className="fz-etiqueta">Categoría</span><div className="fz-chips">{cats.map((c) => <Ficha key={c.id} activa={cla.categoria === c.id} onClick={() => setCla({ ...cla, categoria: c.id, ...(c.actividadSugerida && !cla.actividad ? { asignacion: 'actividad' as const, actividad: c.actividadSugerida } : {}) })}>{c.nombre}</Ficha>)}</div></div>
          <div className="fz-campo"><span className="fz-etiqueta">¿A qué se asigna?</span>
            <Segmentos etiqueta="Asignación" valor={cla.asignacion} alCambiar={(v) => setCla({ ...cla, asignacion: v })} opciones={[['actividad', 'Obra o área'], ['general', 'General']]} />
            {cla.asignacion === 'actividad' && <div className="fz-chips">{catalogo.actividades.map((a) => <Ficha key={a.id} activa={cla.actividad === a.id} onClick={() => setCla({ ...cla, actividad: a.id })}>{a.nombre}</Ficha>)}</div>}
          </div>
          {errForm && <Aviso tono="malo">{errForm}</Aviso>}
          <div className="fz-acciones-fin">
            <button type="button" className="fz-btn fz-btn--navy" disabled={enviando || !cla.categoria} onClick={() => enviar(() => api.post(`operaciones/${id}/clasificacion`, {
              categoria: cla.categoria, asignacion: cla.asignacion, actividad: cla.asignacion === 'actividad' ? cla.actividad : null,
            }), 'Clasificado.')}>{enviando ? 'Guardando…' : 'Guardar clasificación'}</button>
            <button type="button" className="fz-btn fz-btn--claro" onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {modo === 'anular' && (
        <div className="fz-tarjeta fz-pad fz-stack">
          <h3>Anular {op.folio}</h3>
          <p className="fz-ayuda">No se borra: queda marcado como anulado, sus cobros o pagos dejan de contar en saldos y reportes, y el motivo queda en el historial.</p>
          <label className="fz-campo"><span className="fz-etiqueta">Motivo</span><input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Capturado dos veces" /></label>
          {errForm && <Aviso tono="malo">{errForm}</Aviso>}
          <div className="fz-acciones-fin">
            <button type="button" className="fz-btn fz-btn--peligro" disabled={enviando} onClick={() => enviar(() => api.post(`operaciones/${id}/anulacion`, { motivo }), 'Registro anulado. Sigue visible con su historial.')}>{enviando ? 'Guardando…' : 'Anular'}</button>
            <button type="button" className="fz-btn fz-btn--claro" onClick={() => setModo(null)}>Volver</button>
          </div>
        </div>
      )}

      <section className="fz-bloque">
        <h3 className="fz-bloque__h">Datos</h3>
        <dl className="fz-dl">
          <dt>Fecha real</dt><dd>{fecha(op.fechaReal, true)}</dd>
          <dt>Capturado</dt><dd>{momento(op.capturadoEn)} · {op.capturadoPor.nombre}</dd>
          <dt>Estado</dt><dd>{op.anulada ? 'Anulado' : interno ? 'Registrado' : op.pendienteCentavos > 0 ? <>{fmt(op.pagadoCentavos)} {reembolso ? 'reembolsado' : entra ? 'cobrado' : 'pagado'} · <b>{fmt(op.pendienteCentavos)} {reembolso ? `por reembolsar a ${quien}` : 'pendiente'}</b>{op.venceEl ? ` · vence ${fecha(op.venceEl, true)}` : ''}</> : reembolso ? 'Reembolsado' : 'Liquidado'}</dd>
          {reembolso && (<><dt>Pagado con</dt><dd>Dinero propio de {op.reembolsoA?.nombre ?? '—'}</dd></>)}
          {!interno && (<><dt>Categoría</dt><dd>{op.categoria?.nombre ?? <Pastilla tono="aviso">Sin clasificar</Pastilla>}</dd></>)}
          {!interno && (<><dt>Obra o área</dt><dd>{op.asignacion === 'pendiente' ? <Pastilla tono="aviso">Pendiente de asignar</Pastilla> : op.asignacion === 'actividad' ? op.actividad?.nombre ?? '—' : `General${op.actividad ? ` (sugerida: ${op.actividad.nombre})` : ''}`}</dd></>)}
          <dt>Contraparte</dt><dd>{op.contraparte || '—'}</dd>
          {op.notas && (<><dt>Notas</dt><dd>{op.notas}</dd></>)}
        </dl>
      </section>

      <section className="fz-bloque">
        <div className="fz-entre"><h3 className="fz-bloque__h">{interno ? 'Movimientos' : reembolso ? 'Reembolsos' : entra ? 'Cobros' : 'Pagos'}</h3>{d.acciones.liquidar && modo !== 'pago' && <button type="button" className="fz-btn fz-btn--teal fz-btn--chico" onClick={() => abrir('pago')}><Icono n="mas" chico />{reembolso ? 'Registrar reembolso' : entra ? 'Registrar cobro' : 'Registrar pago'}</button>}</div>
        {d.movimientos.length ? (
          <div className="fz-tarjeta fz-lista">
            {d.movimientos.map((m) => (
              <div className="fz-fila fz-fila--estatica" key={m.id}>
                <span className={`fz-fila__ico ${m.direccion === 'entra' ? 'is-entra' : 'is-sale'}`}><Icono n={m.direccion === 'entra' ? 'entra' : 'sale'} chico /></span>
                <span className="fz-fila__main"><span className="fz-fila__t1">{m.cuenta.nombre}</span><span className="fz-fila__t2">{fecha(m.fechaReal, true)} · {m.medio} · {m.modalidad} · {m.capturadoPor.nombre}</span></span>
                <span className={`fz-monto${m.anulado ? ' is-anulado' : ''}`}>{m.direccion === 'entra' ? '+' : '−'}{fmt(m.centavos)}</span>
              </div>
            ))}
          </div>
        ) : <p className="fz-ayuda">{reembolso ? `Todavía no se le reembolsa a ${quien}. Hasta entonces no cambia el dinero disponible.` : `Todavía no hay ${entra ? 'cobros' : 'pagos'}: es un compromiso pendiente y no cambia el dinero disponible.`}</p>}
      </section>

      <section className="fz-bloque">
        <div className="fz-entre"><h3 className="fz-bloque__h">Comprobantes</h3><Pastilla tono={op.evidencia === 'revisada' ? 'ok' : op.evidencia === 'por_revisar' ? 'info' : 'aviso'}>{op.evidencia === 'revisada' ? 'Revisado' : op.evidencia === 'por_revisar' ? 'Por revisar' : 'Sin comprobante'}</Pastilla></div>
        {d.comprobantes.map((c) => (
          <div className="fz-archivo" key={c.id}>
            <span className="fz-archivo__ico"><Icono n={c.tipoContenido.includes('pdf') ? 'archivo' : 'camara'} chico /></span>
            <span className="fz-grow"><a href={`/api/finanzas/comprobantes/${c.id}/archivo`} target="_blank" rel="noreferrer">{c.nombre}</a><span className="fz-tenue fz-chico"> · Subió {c.subidoPor.nombre} · {momento(c.subidoEn)}{c.revisadoPor ? ` · Revisó ${c.revisadoPor.nombre}` : ''}</span></span>
            {!c.revisadoPor && d.acciones.revisar ? <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" disabled={enviando} onClick={() => enviar(() => api.post(`comprobantes/${c.id}/revision`, {}), 'Comprobante marcado como revisado.')}>Marcar revisado</button> : c.revisadoPor ? <Pastilla tono="ok">Revisado</Pastilla> : <Pastilla tono="info">Por revisar</Pastilla>}
          </div>
        ))}
        {d.acciones.adjuntar && (
          <div className="fz-chips">
            <label className="fz-btn fz-btn--claro fz-btn--chico fz-subir"><Icono n="camara" chico />Tomar foto<input type="file" accept="image/*" capture="environment" onChange={subir} /></label>
            <label className="fz-btn fz-btn--claro fz-btn--chico fz-subir"><Icono n="clip" chico />Adjuntar archivo<input type="file" accept="image/*,application/pdf" onChange={subir} /></label>
          </div>
        )}
        {errForm && !modo && <Aviso tono="malo">{errForm}</Aviso>}
      </section>

      <section className="fz-bloque">
        <h3 className="fz-bloque__h">Historial</h3>
        <div className="fz-tarjeta fz-lista">
          {d.bitacora.map((b) => (
            <div className="fz-fila fz-fila--estatica" key={b.id}>
              <span className="fz-fila__main">
                <span className="fz-fila__t1 fz-normal">{ACCION[b.accion] ?? b.accion}{b.campo ? ` ${b.campo}: ${b.anterior} → ${b.nuevo}` : b.nuevo ? ` ${b.nuevo}` : ''}</span>
                {b.motivo && <span className="fz-fila__t2">Motivo: {b.motivo}</span>}
                <span className="fz-fila__t2">{momento(b.fecha)} · {b.usuario.nombre}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {d.acciones.corregir && !modo && (
        <section className="fz-bloque">
          <h3 className="fz-bloque__h">Acciones de administración</h3>
          <div className="fz-chips">
            {!interno && <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => abrir('corregir')}>Corregir</button>}
            {!interno && op.clasificacion === 'pendiente' && <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => abrir('clasificar')}>Clasificar</button>}
            <button type="button" className="fz-btn fz-btn--peligro fz-btn--chico" onClick={() => abrir('anular')}>Anular</button>
          </div>
          {interno && <p className="fz-ayuda">Un traspaso, aportación o retiro no se corrige: se anula y se vuelve a registrar.</p>}
        </section>
      )}
    </div>
  )
}
