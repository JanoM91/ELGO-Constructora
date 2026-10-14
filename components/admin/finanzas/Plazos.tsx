'use client'

/**
 * Pagos parciales y a plazos (heredado de MacAuto, docs/68 de ese proyecto).
 *
 * La persona describe el acuerdo como lo diría («El alumbrado de Coatepec es
 * de 1.2 millones, nos dieron 360 mil de anticipo y el resto en 3
 * estimaciones mensuales»), escrito o dictado con el dictado del teléfono
 * (igual que la nota de voz: no se sube audio). Claude arma un PLAN que aquí
 * se muestra completo y editable —montos, fechas, qué ya se pagó, categoría y
 * obra— y solo se guarda cuando la persona toca «Guardar plan».
 *
 * Se guarda UNA operación por el total (cuenta una sola vez en la obra) con su
 * calendario. Lo ya pagado entra como anticipo; lo demás queda en
 * «Por cobrar o pagar» con la fecha del siguiente pago. Cuando llega cada
 * pago, se abre el registro y se toca «Registrar cobro/pago».
 */
import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'
import { aCentavos } from '../../../lib/finanzas/reglas'
import type { CuotaEntrada, ObraRef, OperacionVista, ResultadoInterpretacionPlan } from '../../../lib/finanzas/tipos'
import { type Clasif, clasifVacia, cuerpoClasif, EditorClasificacion, errorClasif } from './clasificacion'
import { api, Aviso, ErrorApi, fecha, Ficha, fmt, Icono, nuevaClave, pastillasDe, Segmentos, useFinanzas, Volver } from './comun'

const EJEMPLOS = [
  'El alumbrado de Coatepec es de 1.2 millones, hoy nos depositaron 360 mil de anticipo y el resto en 3 estimaciones mensuales de 280 mil',
  'Subcontrato de obra civil para la subestación Banderilla por 180 mil: dimos 60 mil de anticipo del banco y el resto al terminar',
  'Renta de grúa para Las Trancas, 45 mil: pagamos 15 mil hoy y 2 quincenas de 15 mil',
]
const MAX_SEGUNDOS = 60

type Fase = 'escribir' | 'interpretando' | 'plan' | 'listo'
type Tipo = 'entrada' | 'gasto'

/* Dictado del navegador (Web Speech API), igual que la nota de voz: la voz se vuelve texto en el teléfono. */
type ResultadoDictado = { isFinal: boolean; 0: { transcript: string } }
type EventoDictado = { resultIndex: number; results: { length: number; [i: number]: ResultadoDictado } }
type Dictado = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: EventoDictado) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void }
type ConstructorDictado = new () => Dictado
function constructorDictado(): ConstructorDictado | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: ConstructorDictado; webkitSpeechRecognition?: ConstructorDictado }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Dicta y va escribiendo en el cuadro de texto; al terminar, la persona revisa el texto y toca «Armar el plan». */
function useDictado(alTexto: (t: string) => void, alError: (m: string) => void) {
  const [puede, setPuede] = useState(false)
  const [grabando, setGrabando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const d = useRef<Dictado | null>(null)
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende del navegador: solo se sabe después de montar
    setPuede(Boolean(constructorDictado()))
    return () => {
      if (reloj.current) clearInterval(reloj.current)
      try { d.current?.abort() } catch { /* ya estaba detenido */ }
    }
  }, [])
  function terminar() {
    try { d.current?.stop() } catch { /* ya estaba detenido */ }
  }
  function empezar(base: string) {
    const C = constructorDictado()
    if (!C) return
    let definitivo = base ? `${base.trim()} ` : ''
    const x = new C()
    x.lang = 'es-MX'
    x.continuous = true
    x.interimResults = true
    x.onresult = (e) => {
      let parcial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) definitivo += `${r[0].transcript} `
        else parcial += r[0].transcript
      }
      alTexto(`${definitivo}${parcial}`.trimStart())
    }
    x.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      alError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'El teléfono no dio permiso para usar el micrófono o el dictado. Escríbelo, o usa el micrófono del teclado.' : 'No se pudo usar el dictado. Escríbelo.')
    }
    x.onend = () => {
      if (reloj.current) clearInterval(reloj.current)
      reloj.current = null
      d.current = null
      setGrabando(false)
      alTexto(definitivo.trim())
    }
    try {
      x.start()
    } catch {
      alError('No se pudo empezar el dictado. Escríbelo.')
      return
    }
    d.current = x
    setSegundos(0)
    setGrabando(true)
    reloj.current = setInterval(() => setSegundos((s) => {
      if (s + 1 >= MAX_SEGUNDOS) terminar()
      return s + 1
    }), 1000)
  }
  return { puede, grabando, segundos, empezar, terminar }
}

const cuotaVacia = (): CuotaEntrada => ({ fecha: null, importe: '', yaOcurrio: false, nota: '' })

export default function Plazos() {
  const { catalogo, base } = useFinanzas()
  const hoy = catalogo.hoy
  const [fase, setFase] = useState<Fase>('escribir')
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dudas, setDudas] = useState<string[]>([])
  const [candidatas, setCandidatas] = useState<ObraRef[]>([])
  const [tipo, setTipo] = useState<Tipo>('entrada')
  const [total, setTotal] = useState('')
  const [concepto, setConcepto] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [clasif, setClasif] = useState<Clasif>(clasifVacia)
  const [cuotas, setCuotas] = useState<CuotaEntrada[]>([])
  const [cuenta, setCuenta] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState<OperacionVista | null>(null)
  const clave = useRef(nuevaClave())
  const voz = useDictado(setTexto, setError)

  async function interpretar() {
    setFase('interpretando'); setError(null)
    try {
      const r = await api.post<ResultadoInterpretacionPlan>('plazos/interpretar', { texto })
      const b = r.borrador
      setTexto(r.texto); setTipo(b.tipo); setTotal(b.total); setConcepto(b.concepto); setContraparte(b.contraparte)
      setCuotas(b.cuotas.length ? b.cuotas : [cuotaVacia()])
      setCandidatas(r.obrasCandidatas); setDudas(r.dudas)
      const c = catalogo.categorias.find((x) => x.id === b.categoria)
      const actividad = b.actividad ?? c?.actividadSugerida ?? null
      setClasif({
        ...clasifVacia,
        categoria: b.categoria,
        /* La obra que se dijo; si se dijo una que no existe, queda escrita como propuesta. */
        asig: actividad || r.obraTexto || c ? 'actividad' : 'pendiente',
        actividad,
        actividadPropuesta: !actividad && r.obraTexto && !r.obrasCandidatas.length ? r.obraTexto : null,
      })
      setFase('plan')
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo interpretar. Revisa tu conexión e intenta de nuevo.')
      setFase('escribir')
    }
  }

  const totalC = aCentavos(total)
  const sumaC = cuotas.reduce((a, c) => a + (aCentavos(c.importe) || 0), 0)
  const hayYa = cuotas.some((c) => c.yaOcurrio)
  const entra = tipo === 'entrada'

  function revisar(): string | null {
    if (!concepto.trim()) return 'Escribe un concepto breve.'
    if (!(totalC > 0)) return 'Escribe el importe total.'
    if (cuotas.some((c) => !(aCentavos(c.importe) > 0))) return 'Cada pago debe llevar un importe.'
    if (sumaC !== totalC) return `Los pagos suman ${fmt(sumaC, true)} y el total es ${fmt(totalC, true)}.`
    if (cuotas.some((c) => c.yaOcurrio && (!c.fecha || c.fecha > hoy))) return 'Un pago ya hecho necesita fecha de hoy o anterior.'
    if (cuotas.every((c) => c.yaOcurrio)) return 'Todo ya se pagó: regístralo como entrada o gasto normal.'
    if (hayYa && !cuenta) return entra ? 'Elige a qué cuenta entró lo que ya se cobró.' : 'Elige de qué cuenta salió lo que ya se pagó.'
    return errorClasif(clasif)
  }

  async function guardar() {
    const e = revisar()
    if (e) return setError(e)
    setGuardando(true); setError(null)
    try {
      const c = catalogo.cuentas.find((x) => x.id === cuenta)
      const r = await api.post<{ operacion: OperacionVista }>('plazos', {
        tipo, total: (totalC / 100).toFixed(2), concepto: concepto.trim(), contraparte: contraparte.trim() || null,
        ...cuerpoClasif(clasif),
        cuotas: cuotas.map((x) => ({ ...x, fecha: x.fecha || null, importe: (aCentavos(x.importe) / 100).toFixed(2) })),
        cuenta: hayYa ? cuenta : null, medio: hayYa ? (c?.tipo === 'banco' ? 'transferencia' : 'efectivo') : null, texto,
      }, clave.current)
      setHecho(r.operacion)
      setFase('listo')
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar. Reintentar es seguro: no se duplica.')
    } finally {
      setGuardando(false)
    }
  }

  function otro() {
    setFase('escribir'); setTexto(''); setError(null); setDudas([]); setCuotas([]); setHecho(null); setCuenta(null); setClasif(clasifVacia)
    clave.current = nuevaClave()
  }

  const setCuota = (i: number, p: Partial<CuotaEntrada>) => setCuotas(cuotas.map((c, j) => (j === i ? { ...c, ...p } : c)))

  if (!catalogo.permisos.registrar) return <Aviso tono="info">Tu rol no incluye registrar entradas y gastos.</Aviso>

  if (fase === 'listo' && hecho) {
    return (
      <div className="fz-stack">
        <div className="fz-listo">
          <span className="fz-listo__ok"><Icono n="check" /></span>
          <h2>Plan guardado</h2>
          <p className="fz-tenue">{hecho.folio} · {fmt(hecho.totalCentavos, true)} · {hecho.concepto}</p>
          <div className="fz-fila__pills">{pastillasDe(hecho)}</div>
        </div>
        <Aviso tono="info">Lo que falta quedó en <b>Pendientes → Por {entra ? 'cobrar' : 'pagar'}</b>, ordenado por fecha. Cuando llegue cada pago, abre el registro y toca «Registrar {entra ? 'cobro' : 'pago'}».</Aviso>
        <div className="fz-acciones-fin">
          <Link className="fz-btn fz-btn--claro" href={`${base}/operacion/${hecho.id}`}>Ver detalle</Link>
          <button type="button" className="fz-btn fz-btn--claro" onClick={otro}>Otro acuerdo</button>
          <Link className="fz-btn fz-btn--navy" href={base}>Listo</Link>
        </div>
      </div>
    )
  }

  if (fase !== 'plan') {
    return (
      <div className="fz-stack">
        <Volver a={base} etiqueta="Inicio" />
        <div>
          <h1 className="fz-h1">Pagos parciales o a plazos</h1>
          <p className="fz-ayuda">Cuéntalo como lo dirías: qué obra o qué contrato, el total, cuánto se pagó hoy y cómo se paga el resto (anticipo, estimaciones, quincenas, al terminar). Te muestro el plan para que lo revises antes de guardarlo.</p>
        </div>
        <textarea className="fz-input" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} placeholder={EJEMPLOS[0]} aria-label="Describe el acuerdo" disabled={fase === 'interpretando' || voz.grabando} />
        {/* `fz-chips--ejemplos`: frases largas; sin partir el renglón, en un teléfono de 320 px la pantalla se movía de lado (MacAuto, 14-oct-2026). */}
        <div className="fz-chips fz-chips--ejemplos">{EJEMPLOS.map((e) => <Ficha key={e} onClick={() => setTexto(e)}>{e.length > 46 ? `${e.slice(0, 44)}…` : e}</Ficha>)}</div>
        {error && <Aviso tono="malo">{error}</Aviso>}
        {fase === 'interpretando' ? (
          <div className="fz-tarjeta fz-pad fz-centro fz-stack fz-stack--chico"><span className="fz-cargando" aria-hidden="true" /><b>Armando el plan…</b></div>
        ) : voz.grabando ? (
          <button type="button" className="fz-btn fz-btn--peligro fz-btn--bloque" onClick={voz.terminar}><Icono n="stop" chico /> Terminar ({voz.segundos} s)</button>
        ) : (
          <div className="fz-acciones-fin">
            <button type="button" className="fz-btn fz-btn--navy" disabled={texto.trim().length < 8} onClick={() => interpretar()}>Armar el plan</button>
            {voz.puede && <button type="button" className="fz-btn fz-btn--claro" onClick={() => { setError(null); voz.empezar(texto) }}><Icono n="mic" chico /> Dictarlo</button>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fz-captura">
      <div className="fz-stack">
        <button type="button" className="fz-link" onClick={() => setFase('escribir')}>← Cambiar lo que escribí</button>
        <p className="fz-ayuda">«{texto}»</p>
        {dudas.length > 0 && <Aviso tono="aviso"><b>Revisa:</b> {dudas.join(' · ')}</Aviso>}
        <Segmentos<Tipo> etiqueta="Tipo" valor={tipo} alCambiar={(v) => { setTipo(v); setClasif({ ...clasif, categoria: null, categoriaPropuesta: null }) }} opciones={[['entrada', 'Entra dinero · por cobrar'], ['gasto', 'Sale dinero · por pagar']]} />
        <label className="fz-campo"><span className="fz-etiqueta">Concepto</span><input className="fz-input" value={concepto} maxLength={160} onChange={(e) => setConcepto(e.target.value)} /></label>
        <label className="fz-campo"><span className="fz-etiqueta">Total del acuerdo</span><span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></span></label>
        <label className="fz-campo"><span className="fz-etiqueta">{entra ? 'Cliente o dependencia' : 'Subcontratista o proveedor'} <span className="fz-opcional">opcional</span></span><input className="fz-input" value={contraparte} maxLength={160} onChange={(e) => setContraparte(e.target.value)} /></label>

        <div className="fz-campo">
          <span className="fz-etiqueta">Pagos</span>
          <div className="fz-cuotas">
            {cuotas.map((c, i) => (
              <div className="fz-cuota" key={i}>
                <input className="fz-input fz-input--fecha" type="date" aria-label={`Fecha del pago ${i + 1}`} value={c.fecha ?? ''} min={c.yaOcurrio ? catalogo.fechaCorte ?? undefined : undefined} max={c.yaOcurrio ? hoy : undefined} onChange={(e) => setCuota(i, { fecha: e.target.value || null })} />
                <span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" aria-label={`Importe del pago ${i + 1}`} value={c.importe} onChange={(e) => setCuota(i, { importe: e.target.value })} /></span>
                <button type="button" className="fz-icono-btn" aria-label="Quitar pago" onClick={() => setCuotas(cuotas.filter((_, j) => j !== i))}><Icono n="x" chico /></button>
                <div className="fz-cuota__fila2">
                  <label className="fz-check"><input type="checkbox" checked={c.yaOcurrio} onChange={(e) => setCuota(i, { yaOcurrio: e.target.checked, fecha: e.target.checked && (!c.fecha || c.fecha > hoy) ? hoy : c.fecha })} />{entra ? 'Ya se cobró' : 'Ya se pagó'}</label>
                  {!c.fecha && <span className="fz-tenue">Sin fecha</span>}
                  <input className="fz-input fz-input--compacto" value={c.nota} maxLength={80} placeholder="Nota (ej. Estimación 1)" aria-label={`Nota del pago ${i + 1}`} onChange={(e) => setCuota(i, { nota: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <div className="fz-entre">
            <button type="button" className="fz-link" onClick={() => setCuotas([...cuotas, cuotaVacia()])}>+ Agregar pago</button>
            <span className={`fz-chico ${sumaC === totalC && totalC > 0 ? 'fz-tenue' : 'fz-rojo'}`}>Suman {fmt(sumaC, true)} de {fmt(totalC > 0 ? totalC : 0, true)}</span>
          </div>
        </div>

        {hayYa && (
          <div className="fz-campo">
            <span className="fz-etiqueta">{entra ? '¿A qué cuenta entró lo que ya se cobró?' : '¿De qué cuenta salió lo que ya se pagó?'}</span>
            <div className="fz-chips">{catalogo.cuentas.map((c) => <Ficha key={c.id} activa={cuenta === c.id} onClick={() => setCuenta(c.id)}>{c.nombre}</Ficha>)}</div>
          </div>
        )}

        <EditorClasificacion tipo={tipo} valor={clasif} alCambiar={setClasif} candidatas={candidatas} />
      </div>
      <div className="fz-pie">
        <div className="fz-resumen">
          <b>{entra ? 'Por cobrar' : 'Por pagar'} {fmt(Math.max(0, totalC - cuotas.filter((c) => c.yaOcurrio).reduce((a, c) => a + (aCentavos(c.importe) || 0), 0)))}</b>
          <span>{cuotas.filter((c) => !c.yaOcurrio).length} {cuotas.filter((c) => !c.yaOcurrio).length === 1 ? 'pago pendiente' : 'pagos pendientes'}</span>
          {cuotas.find((c) => !c.yaOcurrio && c.fecha) && <span>Primero: {fecha(cuotas.filter((c) => !c.yaOcurrio && c.fecha).map((c) => c.fecha as string).sort()[0])}</span>}
        </div>
        {error && <Aviso tono="malo">{error}</Aviso>}
        <button type="button" className={`fz-btn fz-btn--bloque ${entra ? 'fz-btn--teal' : 'fz-btn--navy'}`} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar plan'}</button>
      </div>
    </div>
  )
}
