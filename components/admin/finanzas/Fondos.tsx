'use client'

/**
 * Fondos a cargo del equipo (etapa 3, docs/62).
 *
 * Un fondo es una cuenta de tipo «Fondo a cargo de un empleado» con una
 * persona responsable. El ciclo completo:
 *   1. Entregar dinero  → traspaso de una caja o banco al fondo.
 *   2. Comprobar        → la persona registra sus gastos pagados «desde su fondo».
 *   3. Devolver         → traspaso del fondo de regreso a la caja.
 * Lo que tiene en su poder = saldo inicial + entregado − comprobado − devuelto.
 *
 * La pantalla solo muestra y manda a «Mover dinero» con las cuentas ya elegidas.
 */
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import type { Fondos as FondosT } from '../../../lib/finanzas/tipos'
import { api, Aviso, fecha, fmt, Icono, useFinanzas } from './comun'

export default function Fondos() {
  const { base, rutaAdmin, catalogo } = useFinanzas()
  const p = catalogo.permisos
  const [data, setData] = useState<FondosT | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    api.get<FondosT>('fondos').then((d) => vivo && setData(d)).catch((e: Error) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [])
  return (
    <div className="fz-stack">
      <h1 className="fz-h1">Fondos a cargo del equipo</h1>
      <p className="fz-ayuda">Dinero entregado a una persona para gastos del negocio. Se le entrega con un traspaso a su fondo, ella registra lo que gasta «desde su fondo» y devuelve el sobrante con otro traspaso.</p>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!data && !error && <div className="fz-tarjeta fz-vacio">Cargando…</div>}
      {data && (
        <>
          <div className="fz-kpi"><span className="fz-kpi__lbl">En manos del equipo (fondos activos)</span><span className="fz-kpi__val">{fmt(data.totalEnManosCentavos)}</span></div>
          {!data.fondos.length && (
            <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
              <h3>Todavía no hay fondos</h3>
              <p className="fz-ayuda">Crea una cuenta de tipo <b>Fondo a cargo de un empleado</b> con la persona responsable en «A cargo de». Después, entrégale dinero desde aquí.</p>
              {p.configurar && <div className="fz-chips"><a className="fz-btn fz-btn--navy fz-btn--chico" href={`${rutaAdmin}/collections/fin-cuentas/create`}>Crear un fondo</a></div>}
            </div>
          )}
          {data.fondos.map((f) => (
            <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico" key={f.cuenta.id}>
              <div className="fz-entre">
                <div>
                  <h3>{f.cuenta.nombre}</h3>
                  <p className="fz-ayuda">{f.cuenta.responsable ? `A cargo de ${f.cuenta.responsable.nombre}` : 'Sin responsable asignado'}{!f.cuenta.activa ? ' · inactivo' : ''}</p>
                </div>
                <span className="fz-fila__ico is-sale"><Icono n="fondo" /></span>
              </div>
              <div className="fz-kpi__val fz-num">{fmt(f.saldoCentavos)} <span className="fz-chico fz-tenue" style={{ fontWeight: 500 }}>en su poder</span></div>
              <dl className="fz-dl fz-dl--compacta">
                <dt>Entregado</dt><dd className="fz-num">{fmt(f.entregadoCentavos)}</dd>
                <dt>Comprobado con gastos</dt><dd className="fz-num">{fmt(f.comprobadoCentavos)}</dd>
                <dt>Devuelto</dt><dd className="fz-num">{fmt(f.devueltoCentavos)}</dd>
                <dt>Último movimiento</dt><dd>{f.ultimoMovimiento ? fecha(f.ultimoMovimiento, true) : '—'}</dd>
              </dl>
              <div className="fz-chips">
                {p.moverDinero && f.cuenta.activa && <Link className="fz-btn fz-btn--navy fz-btn--chico" href={`${base}/mover?tipo=traspaso&a=${f.cuenta.id}`}>Entregar dinero</Link>}
                {p.moverDinero && f.cuenta.activa && <Link className="fz-btn fz-btn--claro fz-btn--chico" href={`${base}/mover?tipo=traspaso&de=${f.cuenta.id}`}>Recibir devolución</Link>}
                <Link className="fz-btn fz-btn--claro fz-btn--chico" href={`${base}/movimientos?cuenta=${f.cuenta.id}`}>Ver movimientos</Link>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
