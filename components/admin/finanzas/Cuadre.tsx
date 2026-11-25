'use client'

/**
 * Cuadre con el banco (24-nov-2026).
 *
 * Por cuenta y por mes, como un estado de cuenta: saldo al iniciar + lo que
 * entró − lo que salió = saldo al cerrar. Quien puede captura el saldo final
 * que dice el banco y la pantalla marca si cuadra; si no, dice qué buscar.
 * También deja cambiar el punto de partida (saldo inicial y su fecha) sin ir
 * al panel. Los cálculos viven en lib/finanzas/reglas.ts (cuadrePorMes) y
 * llegan hechos del servidor; aquí solo se muestran.
 */
import Link from 'next/link'
import React, { useState } from 'react'
import { aCentavos } from '../../../lib/finanzas/reglas'
import type { Cuadre as CuadreT, CuentaCuadre, DetalleCuadre, MesCuadre } from '../../../lib/finanzas/tipos'
import { api, Aviso, fecha, Ficha, fmt, Icono, momento, nuevaClave, Pastilla, useFinanzas } from './comun'
import { useCarga } from './Paginas'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number)
  const n = MESES[m - 1] ?? mes
  return `${n[0].toUpperCase()}${n.slice(1)} ${y}`
}
const $ = (c: number) => fmt(c, true)

const PASTILLA: Record<MesCuadre['estado'], [React.ComponentProps<typeof Pastilla>['tono'], string]> = {
  cuadra: ['ok', 'Cuadra'],
  diferencia: ['malo', 'No cuadra'],
  sin_banco: ['aviso', 'Falta el saldo del banco'],
  en_curso: ['gris', 'Mes en curso'],
}

/** La diferencia en palabras: cuánto y qué buscar. */
function Diferencia({ dif, pista }: { dif: number; pista: MesCuadre['pista'] | 'local' }) {
  if (dif === 0) return <p className="fz-dif is-ok"><Icono n="check" chico /> Igual que el banco.</p>
  const abs = $(Math.abs(dif))
  const que = pista === 'saldo_inicial'
    ? 'La misma diferencia viene desde el primer mes: revisa el saldo inicial.'
    : dif > 0
      ? `Busca en el estado de cuenta un cargo o retiro de ${abs} que no esté en la app (comisiones, cargos automáticos), o una entrada capturada de más.`
      : `Busca un depósito de ${abs} que no esté en la app, o un gasto capturado de más o duplicado.`
  return (
    <div className="fz-stack fz-stack--chico">
      <p className="fz-dif is-mal"><Icono n="alerta" chico /> La app tiene {abs} {dif > 0 ? 'más' : 'menos'} que el banco.</p>
      <p className="fz-ayuda">{que}</p>
    </div>
  )
}

function Renglones({ cuenta, mes }: { cuenta: number; mes: string }) {
  const { base } = useFinanzas()
  const { data, error } = useCarga<DetalleCuadre>('cuadre/mes', { cuenta, mes })
  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (!data) return <div className="fz-vacio fz-chico">Cargando…</div>
  const fin = data.mes.enCurso ? 'Saldo hoy' : 'Saldo al cerrar'
  return (
    <div className="fz-tarjeta fz-lista fz-estado">
      <div className="fz-fila fz-estado__tope"><span className="fz-grow">Saldo al iniciar · {fecha(data.mes.desde, true)}</span><b className="fz-num">{$(data.mes.saldoInicioCentavos)}</b></div>
      {data.renglones.length === 0 && <div className="fz-vacio fz-chico">Sin movimientos este mes.</div>}
      {data.renglones.map((r) => {
        const cuerpo = (
          <>
            <span className="fz-estado__dia">{fecha(r.fecha)}</span>
            <span className="fz-fila__main">
              <span className="fz-fila__t1">{r.concepto}</span>
              {(r.detalle || r.folio) && <span className="fz-fila__t2">{[r.folio, r.detalle].filter(Boolean).join(' · ')}</span>}
            </span>
            <span className="fz-estado__montos">
              <span className={`fz-monto${r.direccion === 'entra' ? ' is-entra' : ''}`}>{r.direccion === 'entra' ? '+' : '−'}{$(r.centavos)}</span>
              <span className="fz-estado__saldo">{$(r.saldoCentavos)}</span>
            </span>
          </>
        )
        return r.restringido || !r.operacionId
          ? <div key={r.id} className="fz-fila">{cuerpo}</div>
          : <Link key={r.id} className="fz-fila" href={`${base}/operacion/${r.operacionId}`}>{cuerpo}</Link>
      })}
      <div className="fz-fila fz-estado__tope"><span className="fz-grow">{fin} · {fecha(data.mes.hasta, true)}</span><b className="fz-num">{$(data.mes.saldoCierreCentavos)}</b></div>
    </div>
  )
}

function TarjetaMes({ m, cuenta, puedeGuardar, alGuardar }: { m: MesCuadre; cuenta: CuentaCuadre; puedeGuardar: boolean; alGuardar: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [notas, setNotas] = useState('')
  const [clave, setClave] = useState(nuevaClave)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tono, etiqueta] = PASTILLA[m.estado]
  const entro = m.entradasCentavos + m.traspasosEntraCentavos
  const salio = m.gastosCentavos + m.traspasosSaleCentavos
  const tecleado = valor.trim() ? aCentavos(valor) : Number.NaN
  const difLocal = Number.isFinite(tecleado) ? m.saldoCierreCentavos - tecleado : null
  const parcialInicio = m.desde.slice(8) !== '01'
  const capturar = !m.enCurso && puedeGuardar && (!m.banco || editando)

  const guardar = async () => {
    if (!Number.isFinite(tecleado)) {
      setError('Escribe el saldo del banco con hasta dos decimales.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await api.post('cuadre', { cuenta: cuenta.id, mes: m.mes, saldoBanco: valor.trim(), notas: notas.trim() || null }, clave)
      setValor('')
      setNotas('')
      setEditando(false)
      setClave(nuevaClave())
      alGuardar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <article className="fz-tarjeta fz-mes">
      <header className="fz-mes__cab">
        <div>
          <h3 className="fz-mes__titulo">{nombreMes(m.mes)}</h3>
          <p className="fz-fila__t2">{m.enCurso ? `Del ${fecha(m.desde)} al ${fecha(m.hasta)}` : parcialInicio ? `Desde el ${fecha(m.desde)}` : 'Mes completo'} · {m.movimientos} {m.movimientos === 1 ? 'movimiento' : 'movimientos'}</p>
        </div>
        <Pastilla tono={tono}>{etiqueta}</Pastilla>
      </header>

      <div className="fz-mes__cifras">
        <div className="fz-cifra"><span className="fz-cifra__lbl">Saldo al iniciar</span><span className="fz-cifra__val">{$(m.saldoInicioCentavos)}</span></div>
        <div className="fz-cifra"><span className="fz-cifra__lbl">+ Entró</span><span className="fz-cifra__val">{$(entro)}</span>{m.traspasosEntraCentavos > 0 && <span className="fz-cifra__det">incluye traspasos {$(m.traspasosEntraCentavos)}</span>}</div>
        <div className="fz-cifra"><span className="fz-cifra__lbl">− Salió</span><span className="fz-cifra__val">{$(salio)}</span>{m.traspasosSaleCentavos > 0 && <span className="fz-cifra__det">incluye traspasos {$(m.traspasosSaleCentavos)}</span>}</div>
        <div className="fz-cifra fz-cifra--total"><span className="fz-cifra__lbl">= {m.enCurso ? 'Saldo hoy' : 'Saldo al cerrar'}</span><span className="fz-cifra__val">{$(m.saldoCierreCentavos)}</span></div>
      </div>

      <div className="fz-banco">
        {m.banco && m.bancoCentavos != null && !editando && (
          <>
            <div className="fz-entre">
              <span>Estado de cuenta: <b className="fz-num">{$(m.bancoCentavos)}</b></span>
              {puedeGuardar && <button type="button" className="fz-link" onClick={() => { setEditando(true); setValor(String(m.bancoCentavos! / 100)) }}>Cambiar</button>}
            </div>
            {m.diferenciaCentavos != null && <Diferencia dif={m.diferenciaCentavos} pista={m.pista} />}
            <p className="fz-ayuda">Lo capturó {m.banco.registradoPor.nombre} el {momento(m.banco.registradoEn)}{m.banco.notas ? ` · ${m.banco.notas}` : ''}</p>
          </>
        )}

        {capturar && (
          <div className="fz-stack fz-stack--chico fz-corto">
            <label className="fz-campo">
              <span className="fz-etiqueta">Saldo final según tu estado de cuenta<span className="fz-tenue fz-chico">al {fecha(m.hasta, true)}</span></span>
              <span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.00" autoComplete="off" /></span>
            </label>
            <input className="fz-input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota" maxLength={300} />
            {difLocal != null && <Diferencia dif={difLocal} pista="local" />}
            {error && <Aviso tono="malo">{error}</Aviso>}
            <div className="fz-chips">
              <button type="button" className="fz-btn fz-btn--navy" disabled={enviando || !valor.trim()} onClick={guardar}>{enviando ? 'Guardando…' : 'Guardar saldo del banco'}</button>
              {editando && <button type="button" className="fz-btn fz-btn--claro" onClick={() => { setEditando(false); setValor(''); setError(null) }}>Cancelar</button>}
            </div>
          </div>
        )}

        {m.enCurso && (
          <div className="fz-stack fz-stack--chico fz-corto">
            <label className="fz-campo">
              <span className="fz-etiqueta">Compara con el saldo del banco hoy<span className="fz-tenue fz-chico">no se guarda</span></span>
              <span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.00" autoComplete="off" /></span>
            </label>
            {difLocal != null && <Diferencia dif={difLocal} pista="local" />}
          </div>
        )}

        {!m.enCurso && !m.banco && !puedeGuardar && <p className="fz-ayuda">Falta capturar el saldo del banco de este mes. Lo captura quien corrige o configura Finanzas.</p>}
      </div>

      <footer className="fz-entre fz-chico">
        <span className="fz-tenue">{fecha(m.desde, true)} – {fecha(m.hasta, true)}</span>
        <button type="button" className="fz-link" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>{abierto ? 'Ocultar movimientos' : 'Ver movimientos del mes'}</button>
      </footer>
      {abierto && <Renglones cuenta={cuenta.id} mes={m.mes} />}
    </article>
  )
}

function PuntoDePartida({ data, alGuardar }: { data: CuadreT; alGuardar: (hecho: string[]) => void }) {
  const cuenta = data.cuenta!
  const [abierto, setAbierto] = useState(false)
  const [fechaInicio, setFechaInicio] = useState(data.inicio ?? data.fechaCorte ?? data.hoy)
  const [saldo, setSaldo] = useState(String(data.saldoInicialCentavos / 100))
  const [usarComoCorte, setUsarComoCorte] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const guardar = async () => {
    if (!Number.isFinite(aCentavos(saldo))) {
      setError('Escribe el saldo inicial con hasta dos decimales.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const r = await api.post<{ hecho: string[] }>('cuadre/inicio', { cuenta: cuenta.id, saldoInicial: saldo.trim(), fechaInicio, usarComoCorte: usarComoCorte && fechaInicio !== data.fechaCorte })
      setAbierto(false)
      alGuardar(r.hecho)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }
  return (
    <section className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Punto de partida</p>
          <p><b className="fz-num">{$(data.saldoInicialCentavos)}</b> <span className="fz-tenue">al iniciar el {data.inicio ? fecha(data.inicio, true) : '—'}</span></p>
        </div>
        {data.puedeCambiarInicio && !abierto && <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => setAbierto(true)}>Cambiar</button>}
      </div>
      <p className="fz-ayuda">Lo que tenía la cuenta al empezar ese día, antes de cualquier movimiento: el saldo final del día anterior en tu estado de cuenta.</p>
      {abierto && (
        <div className="fz-stack fz-stack--chico fz-corto">
          <label className="fz-campo">
            <span className="fz-etiqueta">Fecha de inicio</span>
            <input className="fz-input fz-input--fecha" type="date" value={fechaInicio} max={data.hoy} onChange={(e) => e.target.value && setFechaInicio(e.target.value)} />
          </label>
          <label className="fz-campo">
            <span className="fz-etiqueta">Saldo inicial<span className="fz-tenue fz-chico">saldo final del día anterior</span></span>
            <span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0.00" autoComplete="off" /></span>
          </label>
          {fechaInicio !== data.fechaCorte && (
            <label className="fz-check">
              <input type="checkbox" checked={usarComoCorte} onChange={(e) => setUsarComoCorte(e.target.checked)} />
              <span>Usar el {fecha(fechaInicio, true)} también como fecha de corte de Finanzas{data.fechaCorte ? ` (hoy es el ${fecha(data.fechaCorte, true)})` : ''}. Nadie podrá registrar nada antes de esa fecha.</span>
            </label>
          )}
          {error && <Aviso tono="malo">{error}</Aviso>}
          <div className="fz-chips">
            <button type="button" className="fz-btn fz-btn--navy" disabled={enviando} onClick={guardar}>{enviando ? 'Guardando…' : 'Guardar punto de partida'}</button>
            <button type="button" className="fz-btn fz-btn--claro" onClick={() => { setAbierto(false); setError(null) }}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

export default function Cuadre({ cuentaInicial }: { cuentaInicial: number | null }) {
  const { base } = useFinanzas()
  const [cuenta, setCuenta] = useState<number | null>(cuentaInicial)
  const [hecho, setHecho] = useState<string[] | null>(null)
  const { data, error, recargar } = useCarga<CuadreT>('cuadre', { cuenta })
  const c = data?.cuenta ?? null
  const cerrados = data?.meses.filter((m) => !m.enCurso) ?? []
  const cuadrados = cerrados.filter((m) => m.estado === 'cuadra').length
  return (
    <div className="fz-stack">
      <h1 className="fz-h1">Cuadre con el banco</h1>
      <p className="fz-ayuda">Compara cada mes con tu estado de cuenta. Si el saldo al cerrar de la app es igual al del banco, el mes queda cuadrado; si no, la diferencia te dice qué buscar.</p>
      {data && data.cuentas.length > 1 && (
        <div className="fz-chips fz-chips--scroll">
          {data.cuentas.map((x) => <Ficha key={x.id} activa={c?.id === x.id} onClick={() => { setCuenta(x.id); setHecho(null) }}>{x.nombre}{!x.activa && <span className="fz-chip__tag">inactiva</span>}</Ficha>)}
        </div>
      )}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!data && !error && <div className="fz-tarjeta fz-vacio">Cargando…</div>}
      {data && !c && <div className="fz-tarjeta fz-vacio">Todavía no hay cuentas. Agrégalas en Configuración → Cuentas y cajas.</div>}
      {data && c && (
        <>
          {hecho && <Aviso tono="ok">Guardado: {hecho.join(' · ')}.</Aviso>}
          <div className="fz-kpis fz-kpis--3">
            <Link className="fz-kpi" href={`${base}/movimientos?cuenta=${c.id}`}><span className="fz-kpi__lbl">{c.nombre} · saldo en la app hoy</span><span className="fz-kpi__val">{$(c.saldoCentavos)}</span></Link>
            <div className="fz-kpi"><span className="fz-kpi__lbl">Meses cerrados que cuadran</span><span className={`fz-kpi__val${cerrados.length && cuadrados < cerrados.length ? ' fz-ambar' : ''}`}>{cuadrados} de {cerrados.length}</span></div>
            <div className="fz-kpi"><span className="fz-kpi__lbl">Fecha de corte de Finanzas</span><span className="fz-kpi__val">{data.fechaCorte ? fecha(data.fechaCorte, true) : '—'}</span></div>
          </div>
          <PuntoDePartida key={`${c.id}-${data.inicio}-${data.saldoInicialCentavos}`} data={data} alGuardar={(h) => { setHecho(h); recargar() }} />
          {data.antes.movimientos > 0 && data.inicio && (
            <Aviso tono="aviso">
              Hay {data.antes.movimientos} {data.antes.movimientos === 1 ? 'movimiento' : 'movimientos'} con fecha anterior al inicio de esta cuenta ({fecha(data.inicio, true)}), por {$(data.antes.netoCentavos)} netos. Cuentan en el saldo, pero el saldo inicial ya debería incluirlos: revisa la fecha de inicio o esos movimientos.
            </Aviso>
          )}
          {data.fechaCorte && data.inicio && data.fechaCorte !== data.inicio && data.antes.movimientos === 0 && (
            <Aviso tono="info">Esta cuenta arranca el {fecha(data.inicio, true)} y la fecha de corte de Finanzas es el {fecha(data.fechaCorte, true)}.</Aviso>
          )}
          {data.meses.length
            ? <div className="fz-stack">{data.meses.map((m) => <TarjetaMes key={`${c.id}-${m.mes}`} m={m} cuenta={c} puedeGuardar={data.puedeGuardar} alGuardar={recargar} />)}</div>
            : <div className="fz-tarjeta fz-vacio">Esta cuenta arranca después de hoy.</div>}
          <p className="fz-ayuda">Cada movimiento cuenta en el mes de su fecha real, con traspasos incluidos. Lo anulado no cuenta. Los compromisos por cobrar o por pagar no mueven el saldo hasta que se cobran o se pagan.</p>
        </>
      )}
    </div>
  )
}
