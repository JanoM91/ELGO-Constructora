'use client'

/**
 * Mover dinero (etapa 3, docs/62): lo que no es entrada ni gasto.
 *
 *   - Traspaso entre cuentas: de una cuenta o caja a otra. Sirve también para
 *     entregar dinero a un fondo a cargo de alguien y para recibir lo que
 *     devuelve (Fondos.tsx llega aquí con las cuentas ya elegidas).
 *   - Aportación de socio: entra dinero que no es una venta.
 *   - Retiro de socio: sale dinero que no es un gasto.
 *
 * Ninguno cuenta en el resultado del negocio; todos mueven saldos. Solo para
 * roles con «Mover dinero». Misma mecánica que Captura: pie fijo con el
 * botón, reintento seguro con clave, pantalla de «listo».
 */
import Link from 'next/link'
import React, { useMemo, useRef, useState } from 'react'
import { aCentavos, sumarDias } from '../../../lib/finanzas/reglas'
import type { CuentaVista, OperacionVista, TipoMovimientoInterno } from '../../../lib/finanzas/tipos'
import { api, Aviso, ErrorApi, fecha, Ficha, fmt, Icono, nuevaClave, Segmentos, useFinanzas, Volver } from './comun'

type Medio = 'efectivo' | 'transferencia' | 'deposito' | 'cheque'
const MEDIOS: [Medio, string][] = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['deposito', 'Depósito'], ['cheque', 'Cheque']]
const NOMBRES: Record<TipoMovimientoInterno, string> = { traspaso: 'traspaso', aportacion: 'aportación', retiro: 'retiro' }

function nombreCuenta(c: CuentaVista): React.ReactNode {
  return c.tipo === 'fondo' ? <>{c.nombre} <span className="fz-chip__tag">fondo</span></> : c.nombre
}

export default function Mover({ tipoInicial, deInicial, aInicial }: { tipoInicial: TipoMovimientoInterno; deInicial: number | null; aInicial: number | null }) {
  const { catalogo, base } = useFinanzas()
  const { hoy, cuentas } = catalogo
  const [tipo, setTipo] = useState<TipoMovimientoInterno>(tipoInicial)
  const [importe, setImporte] = useState('')
  const [de, setDe] = useState<number | null>(deInicial)
  const [a, setA] = useState<number | null>(aInicial)
  const [medio, setMedio] = useState<Medio | null>(null)
  const [fechaReal, setFechaReal] = useState(hoy)
  const [concepto, setConcepto] = useState('')
  const [contraparte, setContraparte] = useState('')
  const [notas, setNotas] = useState('')
  const [mas, setMas] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ op: OperacionVista; duplicado: boolean } | null>(null)
  const clave = useRef(nuevaClave())

  const total = aCentavos(importe)
  const totalOk = Number.isInteger(total) && total > 0
  const cuentaDe = cuentas.find((c) => c.id === de) ?? null
  const cuentaA = cuentas.find((c) => c.id === a) ?? null
  const activas = useMemo(() => cuentas.filter((c) => c.activa), [cuentas])
  const medioSugerido: Medio = (tipo === 'aportacion' ? cuentaA : cuentaDe)?.tipo === 'banco' ? 'transferencia' : 'efectivo'
  const ayer = sumarDias(hoy, -1)
  const sugerido = tipo === 'traspaso'
    ? `Traspaso ${cuentaDe?.nombre ?? '…'} → ${cuentaA?.nombre ?? '…'}`
    : `${tipo === 'aportacion' ? 'Aportación' : 'Retiro'}${contraparte.trim() ? ` de ${contraparte.trim()}` : ' de socio'}`

  function cambiarTipo(t: TipoMovimientoInterno) {
    setTipo(t); setError(null)
    if (t === 'aportacion') setDe(null)
    if (t === 'retiro') setA(null)
  }

  function revisar(): string | null {
    if (!totalOk) return 'Escribe el importe (a lo más dos decimales).'
    if (tipo !== 'aportacion' && !de) return 'Elige de qué cuenta o caja sale.'
    if (tipo !== 'retiro' && !a) return 'Elige a qué cuenta o caja entra.'
    if (tipo === 'traspaso' && de === a) return 'La cuenta de salida y la de entrada tienen que ser distintas.'
    if (tipo !== 'traspaso' && !contraparte.trim()) return 'Escribe el nombre del socio.'
    if (fechaReal > hoy) return 'La fecha no puede ser futura.'
    return null
  }

  async function guardar() {
    if (guardando) return
    const err = revisar()
    if (err) {
      setError(err)
      return
    }
    setError(null); setGuardando(true)
    try {
      const r = await api.post<{ operacion: OperacionVista; duplicado: boolean }>('movimientos-internos', {
        tipo, importe: (total / 100).toFixed(2), fechaReal, de: tipo === 'aportacion' ? null : de, a: tipo === 'retiro' ? null : a,
        medio: medio ?? medioSugerido, concepto: concepto.trim() || sugerido, contraparte: tipo === 'traspaso' ? null : contraparte.trim(), notas: notas.trim() || null,
      }, clave.current)
      setListo({ op: r.operacion, duplicado: r.duplicado })
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar. Revisa tu conexión: reintentar es seguro, no se duplica.')
    } finally {
      setGuardando(false)
    }
  }

  function otro() {
    setImporte(''); setConcepto(''); setContraparte(''); setNotas(''); setMas(false); setError(null); setListo(null); setMedio(null); setFechaReal(hoy)
    clave.current = nuevaClave()
    window.scrollTo(0, 0)
  }

  if (listo) {
    const { op } = listo
    return (
      <div className="fz-stack">
        <div className="fz-listo">
          <span className="fz-listo__ok"><Icono n="check" /></span>
          <h2>{op.tipo === 'traspaso' ? 'Traspaso registrado' : op.tipo === 'aportacion' ? 'Aportación registrada' : 'Retiro registrado'}</h2>
          <p className="fz-tenue">{op.folio} · {fmt(op.totalCentavos, true)} · {op.concepto}</p>
          {listo.duplicado && <p className="fz-ayuda">Ya estaba guardado: no se duplicó.</p>}
        </div>
        <div className="fz-acciones-fin">
          <Link className="fz-btn fz-btn--claro" href={`${base}/operacion/${op.id}`}>Ver detalle</Link>
          <button type="button" className="fz-btn fz-btn--claro" onClick={otro}>Otro movimiento</button>
          <Link className="fz-btn fz-btn--navy" href={deInicial || aInicial ? `${base}/fondos` : base}>Listo</Link>
        </div>
      </div>
    )
  }

  const chips = (elegida: number | null, elegir: (id: number) => void, excluir: number | null) => (
    <div className="fz-chips">
      {activas.filter((c) => c.id !== excluir).map((c) => (
        <Ficha key={c.id} activa={elegida === c.id} onClick={() => { elegir(c.id); setError(null) }}>{nombreCuenta(c)}</Ficha>
      ))}
    </div>
  )

  return (
    <div className="fz-captura">
      <div className="fz-stack">
        <div className="fz-entre">
          <h1 className="fz-h1">Mover dinero</h1>
          {(deInicial || aInicial) && <Volver a={`${base}/fondos`} etiqueta="Fondos" />}
        </div>
        <Segmentos<TipoMovimientoInterno> etiqueta="Tipo de movimiento" valor={tipo} alCambiar={cambiarTipo} opciones={[['traspaso', 'Traspaso'], ['aportacion', 'Aportación'], ['retiro', 'Retiro']]} />
        <p className="fz-ayuda">
          {tipo === 'traspaso' && 'De una cuenta o caja a otra. También para entregar dinero a un fondo a cargo de alguien, o recibir lo que devuelve.'}
          {tipo === 'aportacion' && 'Un socio mete dinero al negocio. No es una venta: no cuenta en el resultado, pero sí en el saldo.'}
          {tipo === 'retiro' && 'Un socio saca dinero del negocio. No es un gasto: no cuenta en el resultado, pero sí en el saldo.'}
        </p>

        <label className="fz-campo">
          <span className="fz-etiqueta">Importe</span>
          <span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0" autoComplete="off" /></span>
        </label>

        {tipo !== 'aportacion' && (
          <div className="fz-campo">
            <span className="fz-etiqueta">{tipo === 'traspaso' ? '¿De dónde sale?' : '¿De qué cuenta o caja sale?'}</span>
            {activas.length ? chips(de, setDe, null) : <Aviso tono="aviso">Todavía no hay cuentas dadas de alta.</Aviso>}
          </div>
        )}
        {tipo !== 'retiro' && (
          <div className="fz-campo">
            <span className="fz-etiqueta">{tipo === 'traspaso' ? '¿A dónde entra?' : '¿A qué cuenta o caja entra?'}</span>
            {activas.length ? chips(a, setA, tipo === 'traspaso' ? de : null) : null}
          </div>
        )}
        {tipo !== 'traspaso' && (
          <label className="fz-campo">
            <span className="fz-etiqueta">Socio</span>
            <input className="fz-input" value={contraparte} onChange={(e) => setContraparte(e.target.value)} maxLength={160} placeholder="Nombre del socio" />
          </label>
        )}

        <div className="fz-campo">
          <span className="fz-etiqueta">Medio</span>
          <Segmentos<Medio> etiqueta="Medio" valor={medio ?? medioSugerido} alCambiar={setMedio} opciones={MEDIOS} />
        </div>

        <div className="fz-campo">
          <span className="fz-etiqueta">Fecha real</span>
          <div className="fz-chips">
            <Ficha activa={fechaReal === hoy} onClick={() => setFechaReal(hoy)}>Hoy</Ficha>
            <Ficha activa={fechaReal === ayer} onClick={() => setFechaReal(ayer)}>Ayer</Ficha>
            <input className="fz-input fz-input--fecha" type="date" aria-label="Otra fecha" value={fechaReal} min={catalogo.fechaCorte ?? undefined} max={hoy} onChange={(e) => e.target.value && setFechaReal(e.target.value)} />
          </div>
        </div>

        <label className="fz-campo">
          <span className="fz-etiqueta">Concepto <span className="fz-opcional">opcional</span></span>
          <input className="fz-input" value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={160} placeholder={sugerido} />
        </label>

        <div className="fz-campo">
          <button type="button" className="fz-link" onClick={() => setMas(!mas)}>{mas ? '− Ocultar' : '+ Agregar'} notas</button>
          {mas && <textarea className="fz-input" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} placeholder="Notas" aria-label="Notas" rows={3} />}
        </div>
      </div>

      <div className="fz-pie">
        <div className="fz-resumen">
          <b>{tipo === 'traspaso' ? 'Traspaso' : tipo === 'aportacion' ? 'Aportación' : 'Retiro'} {fmt(totalOk ? total : 0)}</b>
          {tipo === 'traspaso' ? <span>{cuentaDe?.nombre ?? '…'} → {cuentaA?.nombre ?? '…'}</span> : <span>{(tipo === 'aportacion' ? cuentaA : cuentaDe)?.nombre ?? 'Falta la cuenta'}</span>}
          <span>{fecha(fechaReal)}</span>
        </div>
        {error && <Aviso tono="malo">{error}</Aviso>}
        <button type="button" className="fz-btn fz-btn--bloque fz-btn--navy" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : `Guardar ${NOMBRES[tipo]}`}
        </button>
      </div>
    </div>
  )
}
