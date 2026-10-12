'use client'

/**
 * Nota de voz (heredada de MacAuto Finanzas, docs/62 de ese proyecto).
 *
 * La persona toca el micrófono, dicta («pagué tres mil doscientos de una placa
 * de titanio, de la caja chica»), vuelve a tocar para terminar y recibe un
 * borrador: qué entendió el sistema y qué le faltó. Si está de acuerdo, toca
 * «Revisar y guardar»: el borrador llena el formulario de captura, donde lo
 * corrige lo que haga falta y lo guarda. NADA se guarda desde esta pantalla.
 *
 * Cómo escucha (distinto de MacAuto): el DICTADO DEL NAVEGADOR (Web Speech
 * API: Safari en iPhone, Chrome en Android y computadora) convierte la voz en
 * texto en el propio teléfono, y solo ese texto viaja al servidor, donde
 * Claude lo interpreta (lib/finanzas/voz.ts). No se sube audio. Máximo 60
 * segundos. Si el navegador no tiene dictado (Firefox, por ejemplo) o no da
 * permiso de micrófono, queda «Escríbelo», donde también sirve el micrófono
 * del teclado del teléfono.
 */
import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import type { ResultadoVoz } from '../../../lib/finanzas/tipos'
import { type Borrador, claveBorrador, escribirBorrador } from './borrador'
import { api, Aviso, ErrorApi, fecha, fmt, Icono, useFinanzas, Volver } from './comun'

const MAX_SEGUNDOS = 60
const EJEMPLOS = ['Pagué 3,200 de cable para la obra de Banderilla, del fondo de obra', 'Compré 450 de diésel para la retro con mi dinero', 'Cobramos 180 mil de la estimación 2 del alumbrado de Coatepec por transferencia al banco']

type Fase = 'listo' | 'grabando' | 'procesando' | 'resultado'

/* Tipos mínimos del dictado del navegador (no vienen en lib.dom de TypeScript). */
type ResultadoDictado = { isFinal: boolean; 0: { transcript: string } }
type EventoDictado = { resultIndex: number; results: { length: number; [i: number]: ResultadoDictado } }
type Dictado = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: EventoDictado) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type ConstructorDictado = new () => Dictado

function constructorDictado(): ConstructorDictado | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: ConstructorDictado; webkitSpeechRecognition?: ConstructorDictado }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export default function Voz() {
  const { catalogo, base } = useFinanzas()
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('listo')
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null)
  const [modoTexto, setModoTexto] = useState(false)
  const [texto, setTexto] = useState('')
  const [soporte, setSoporte] = useState<boolean | null>(null)
  const [enVivo, setEnVivo] = useState('')
  const dictado = useRef<Dictado | null>(null)
  const definitivo = useRef('')
  const parcial = useRef('')
  const cancelado = useRef(false)
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende del navegador: solo se sabe después de montar
    setSoporte(Boolean(constructorDictado()))
    return () => detenerTodo()
  }, [])

  function detenerTodo() {
    if (reloj.current) clearInterval(reloj.current)
    reloj.current = null
    const d = dictado.current
    dictado.current = null
    if (d) {
      cancelado.current = true
      try { d.abort() } catch { /* ya estaba detenido */ }
    }
  }

  function empezar() {
    const C = constructorDictado()
    if (!C) {
      setModoTexto(true)
      return
    }
    setError(null)
    definitivo.current = ''
    parcial.current = ''
    cancelado.current = false
    setEnVivo('')
    const d = new C()
    d.lang = 'es-MX'
    d.continuous = true
    d.interimResults = true
    d.onresult = (e) => {
      let parciales = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) definitivo.current += `${r[0].transcript} `
        else parciales += r[0].transcript
      }
      parcial.current = parciales
      setEnVivo(`${definitivo.current}${parciales}`.trim())
    }
    d.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      cancelado.current = true
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'El teléfono no dio permiso para usar el micrófono o el dictado. Actívalo en los ajustes del navegador para este sitio, o escríbelo abajo.'
        : e.error === 'network' ? 'El dictado necesita internet. Revisa tu conexión o escríbelo abajo.' : 'No se pudo usar el dictado. Escríbelo abajo.')
      setModoTexto(true)
      setFase('listo')
    }
    d.onend = () => {
      if (reloj.current) clearInterval(reloj.current)
      reloj.current = null
      dictado.current = null
      if (cancelado.current) return
      const texto = `${definitivo.current}${parcial.current}`.trim()
      if (!texto) {
        setError('No se escuchó nada. Intenta de nuevo, más cerca del micrófono, o escríbelo abajo.')
        setFase('listo')
        return
      }
      void enviar(texto)
    }
    try {
      d.start()
    } catch {
      setError('No se pudo empezar el dictado. Escríbelo abajo.')
      setModoTexto(true)
      return
    }
    dictado.current = d
    setSegundos(0)
    setFase('grabando')
    reloj.current = setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= MAX_SEGUNDOS) terminar()
        return s + 1
      })
    }, 1000)
  }

  function terminar() {
    if (reloj.current) clearInterval(reloj.current)
    reloj.current = null
    /* stop() entrega lo que falte y luego dispara onend, que envía el texto. */
    try { dictado.current?.stop() } catch { /* ya estaba detenido */ }
  }

  async function enviar(texto: string) {
    setFase('procesando'); setError(null); setResultado(null)
    try {
      const form = new FormData()
      form.append('texto', texto)
      const r = await api.formulario<ResultadoVoz>('voz', form)
      setResultado(r)
      setFase('resultado')
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo procesar la nota. Revisa tu conexión e intenta de nuevo.')
      setFase('listo')
    }
  }

  function revisarYGuardar() {
    if (!resultado) return
    const b = resultado.borrador
    const asig = b.asig
    const borrador: Borrador = {
      v: 1, guardadoEn: Date.now(), origen: 'voz', tipo: b.tipo, importe: b.importe, estado: b.estado, cuenta: b.cuenta, medio: b.medio, concepto: b.concepto,
      categoria: b.categoria, noSe: false, asig, asigTocada: Boolean(asig), actividad: b.actividad,
      fechaReal: b.fechaReal, venceEl: '', mas: Boolean(b.contraparte || b.notas), contraparte: b.contraparte, notas: b.notas, reembolsoA: null, archivos: 0,
    }
    escribirBorrador(claveBorrador(catalogo.usuario.id, b.tipo), borrador)
    router.push(`${base}/registrar?tipo=${b.tipo}`)
  }

  function deNuevo() {
    setResultado(null); setError(null); setFase('listo'); setTexto('')
  }

  const b = resultado?.borrador
  const nombreCuenta = b?.cuenta != null ? catalogo.cuentas.find((c) => c.id === b.cuenta)?.nombre ?? null : null
  const nombreCategoria = b?.categoria != null ? catalogo.categorias.find((c) => c.id === b.categoria)?.nombre ?? null : null
  const nombreActividad = b?.actividad != null ? catalogo.actividades.find((a) => a.id === b.actividad)?.nombre ?? null : null

  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <h1 className="fz-h1">Nota de voz</h1>
        <Volver a={base} etiqueta="Inicio" />
      </div>

      {fase !== 'resultado' && (
        <>
          <p className="fz-ayuda">Di <b>qué pasó, cuánto fue, de dónde salió el dinero y de qué obra</b> (o si es de oficina, concursos o maquinaria). El sistema arma el borrador; tú lo revisas y lo guardas.</p>
          {soporte === false && !modoTexto && <Aviso tono="info">Este navegador no tiene dictado. Escríbelo abajo (puedes usar el micrófono del teclado): funciona igual.</Aviso>}
          {error && <Aviso tono="malo">{error}</Aviso>}

          {soporte && !modoTexto && (
            <div className="fz-voz">
              {fase === 'grabando' ? (
                <>
                  <button type="button" className="fz-grabar is-grabando" onClick={terminar} aria-label="Terminar dictado"><Icono n="stop" /></button>
                  <div className="fz-voz__estado"><span className="fz-voz__punto" /> Escuchando · {segundos}s <span className="fz-tenue">/ {MAX_SEGUNDOS}s</span></div>
                  {enVivo && <p className="fz-voz__transcripcion">«{enVivo}»</p>}
                  <p className="fz-ayuda">Toca el cuadro para terminar.</p>
                </>
              ) : fase === 'procesando' ? (
                <>
                  <span className="fz-grabar is-procesando" aria-hidden="true"><Icono n="mic" /></span>
                  <div className="fz-voz__estado">Armando el borrador…</div>
                </>
              ) : (
                <>
                  <button type="button" className="fz-grabar" onClick={empezar} aria-label="Empezar a dictar"><Icono n="mic" /></button>
                  <div className="fz-voz__estado">Toca para dictar</div>
                </>
              )}
            </div>
          )}

          {fase === 'listo' && (
            <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
              <h3>Ejemplos</h3>
              {EJEMPLOS.map((e) => <p key={e} className="fz-ayuda">«{e}»</p>)}
            </div>
          )}

          {fase === 'listo' && (modoTexto || soporte === false ? (
            <div className="fz-campo">
              <span className="fz-etiqueta">Escríbelo <span className="fz-opcional">o usa el micrófono del teclado</span></span>
              <textarea className="fz-input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} placeholder="Ej. Pagué 3,200 de una placa de titanio, de la caja chica" aria-label="Nota escrita" />
              <div className="fz-acciones-fin">
                <button type="button" className="fz-btn fz-btn--navy" disabled={!texto.trim()} onClick={() => enviar(texto.trim())}><Icono n="enviar" chico />Interpretar</button>
                {soporte && <button type="button" className="fz-btn fz-btn--claro" onClick={() => { setModoTexto(false); setError(null) }}>Mejor dictar</button>}
              </div>
            </div>
          ) : soporte ? (
            <p className="fz-ayuda"><button type="button" className="fz-link" onClick={() => setModoTexto(true)}>Prefiero escribirlo</button></p>
          ) : null)}
        </>
      )}

      {fase === 'resultado' && resultado && b && (
        <>
          <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
            <p className="fz-eyebrow">Esto escuché</p>
            <p className="fz-voz__transcripcion">«{resultado.transcripcion}»</p>
          </div>
          <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
            <p className="fz-eyebrow">Esto entendí</p>
            <div className={`fz-monto-grande${b.tipo === 'entrada' ? ' is-entra' : ''}`}>{b.importe ? `${b.tipo === 'entrada' ? '+' : '−'}${fmt(Math.round(Number(b.importe) * 100), true)}` : 'Sin importe'}</div>
            <dl className="fz-dl fz-dl--compacta">
              <dt>Tipo</dt><dd>{b.tipo === 'entrada' ? 'Entrada · entró dinero' : 'Gasto · salió dinero'}</dd>
              <dt>Concepto</dt><dd>{b.concepto || <span className="fz-ambar">Falta</span>}</dd>
              <dt>{b.tipo === 'entrada' ? 'Cuenta' : 'Pagado con'}</dt><dd>{b.estado === 'propio' ? 'Dinero propio · por reembolsar' : b.estado === 'pendiente' ? (b.tipo === 'entrada' ? 'Por cobrar' : 'Por pagar') : nombreCuenta ?? <span className="fz-ambar">Falta la cuenta</span>}</dd>
              <dt>Categoría</dt><dd>{nombreCategoria ?? <span className="fz-tenue">Sin clasificar (la eliges en el formulario)</span>}</dd>
              <dt>Obra o área</dt><dd>{nombreActividad ?? <span className="fz-tenue">Sin obra (la eliges en el formulario)</span>}</dd>
              <dt>Fecha</dt><dd>{fecha(b.fechaReal, true)}{b.fechaReal === catalogo.hoy ? ' (hoy)' : ''}</dd>
              {b.contraparte && (<><dt>Contraparte</dt><dd>{b.contraparte}</dd></>)}
            </dl>
          </div>
          {resultado.dudas.length > 0 && (
            <Aviso tono="aviso"><b>Revisa en el formulario:</b> {resultado.dudas.join(' ')}</Aviso>
          )}
          <div className="fz-acciones-fin">
            <button type="button" className={`fz-btn ${b.tipo === 'entrada' ? 'fz-btn--teal' : 'fz-btn--navy'}`} onClick={revisarYGuardar}>Revisar y guardar</button>
            <button type="button" className="fz-btn fz-btn--claro" onClick={deNuevo}>Dictar de nuevo</button>
          </div>
          <p className="fz-ayuda">Nada se guarda todavía: en el formulario puedes cambiar cualquier dato antes de guardar.</p>
        </>
      )}
    </div>
  )
}
