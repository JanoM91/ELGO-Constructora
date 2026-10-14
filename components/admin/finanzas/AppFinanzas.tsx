'use client'

/**
 * El «armazón» de Finanzas dentro del panel (heredado de MacAuto Finanzas).
 *
 * - Quien entra al panel completo ve Finanzas como una sección más, con una
 *   barra de pestañas propia arriba.
 * - Quien solo captura (su rol no tiene «Entra al panel completo») ve una
 *   pantalla limpia, pensada para el celular: encabezado con la marca y una
 *   barra inferior. No ve el menú del panel ni nada del sitio.
 *
 * Qué pantalla pintar lo decide la ruta (/admin/finanzas/registrar, …) que
 * le pasa VistaFinanzas.tsx.
 *
 * Desde octubre de 2026 (docs/61) está pensado para vivir como icono en la
 * pantalla de inicio del teléfono: el encabezado cabe en 320 px (marca a la
 * izquierda, iniciales y «Salir» a la derecha; el nombre completo solo desde
 * 480 px) y, mientras se abra desde el navegador, aparece la invitación a
 * agregarla a la pantalla de inicio (AvisoInstalar).
 */
import Link from 'next/link'
import React from 'react'
import type { Catalogo } from '../../../lib/finanzas/tipos'
import AvisoInstalar from './AvisoInstalar'
import Captura from './Captura'
import Detalle from './Detalle'
import Fondos from './Fondos'
import Mover from './Mover'
import Plazos from './Plazos'
import Revisar from './Revisar'
import Ticket from './Ticket'
import Voz from './Voz'
import { Aviso, FinanzasCtx, Icono, iniciales } from './comun'
import { Configuracion, Inicio, Movimientos, Obras, Pendientes, Saldos } from './Paginas'

type Props = {
  catalogo: Catalogo
  ruta: string[]
  query: Record<string, string>
  rutaAdmin: string
  soloCaptura: boolean
  marca: { wordmark: string; nombre: string }
}

export default function AppFinanzas({ catalogo, ruta, query, rutaAdmin, soloCaptura, marca }: Props) {
  const base = `${rutaAdmin}/finanzas`
  const p = catalogo.permisos
  const [seccion, id] = ruta

  const numero = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null)
  let pantalla: React.ReactNode
  if (!seccion) pantalla = <Inicio />
  else if (seccion === 'registrar') pantalla = p.registrar ? <Captura key={`${query.tipo === 'entrada' ? 'entrada' : 'gasto'}-${query.cuenta ?? ''}`} tipoInicial={query.tipo === 'entrada' ? 'entrada' : 'gasto'} cuentaInicial={numero(query.cuenta)} /> : <Aviso tono="info">Tu rol no incluye registrar entradas y gastos.</Aviso>
  else if (seccion === 'ticket') pantalla = <Ticket />
  else if (seccion === 'plazos') pantalla = <Plazos />
  else if (seccion === 'revisar') pantalla = <Revisar key={`${query.grupo ?? ''}-${query.op ?? ''}`} grupo={query.grupo || null} opId={numero(query.op)} />
  else if (seccion === 'voz') pantalla = p.registrar ? <Voz /> : <Aviso tono="info">Tu rol no incluye registrar entradas y gastos.</Aviso>
  else if (seccion === 'mover') pantalla = p.moverDinero ? <Mover key={`${query.tipo ?? ''}-${query.de ?? ''}-${query.a ?? ''}`} tipoInicial={query.tipo === 'aportacion' || query.tipo === 'retiro' ? query.tipo : 'traspaso'} deInicial={numero(query.de)} aInicial={numero(query.a)} /> : <Aviso tono="info">Tu rol no incluye mover dinero entre cuentas.</Aviso>
  else if (seccion === 'fondos') pantalla = p.moverDinero || p.verSaldos || p.liquidar ? <Fondos /> : <Aviso tono="info">Tu rol no incluye ver los fondos del equipo.</Aviso>
  else if (seccion === 'movimientos') pantalla = <Movimientos key={`${query.cuenta ?? ''}-${query.obra ?? ''}`} cuentaInicial={numero(query.cuenta)} obraInicial={numero(query.obra)} />
  else if (seccion === 'obras') pantalla = p.verUtilidad ? <Obras /> : <Aviso tono="info">Tu rol no incluye ver el resultado por obra.</Aviso>
  else if (seccion === 'operacion' && id && /^\d+$/.test(id)) pantalla = <Detalle key={id} id={Number(id)} />
  else if (seccion === 'pendientes') pantalla = <Pendientes inicial={query.ver ?? null} />
  else if (seccion === 'saldos') pantalla = p.verSaldos ? <Saldos /> : <Aviso tono="info">Tu rol no incluye ver saldos.</Aviso>
  else if (seccion === 'configuracion') pantalla = <Configuracion />
  else pantalla = <Aviso tono="aviso">Esa pantalla no existe. <Link href={base}>Volver al inicio de Finanzas</Link></Aviso>

  const pestanas: [string, string, string, boolean][] = [
    ['', 'Inicio', 'inicio', true],
    ['registrar', 'Registrar', 'mas', p.registrar],
    ['movimientos', 'Movimientos', 'lista', true],
    ['obras', 'Obras', 'obra', p.verUtilidad],
    ['pendientes', 'Pendientes', 'bandeja', true],
    ['saldos', 'Saldos', 'cartera', p.verSaldos],
    ['fondos', 'Fondos', 'fondo', p.moverDinero || p.verSaldos || p.liquidar],
    ['mover', 'Mover dinero', 'traspaso', p.moverDinero],
    ['configuracion', 'Configuración', 'ajustes', p.configurar || p.gestionarUsuarios],
  ]
  const visibles = pestanas.filter((x) => x[3])
  const activa = (k: string) => (seccion ?? '') === k || (k === 'movimientos' && seccion === 'operacion') || (k === 'registrar' && (seccion === 'voz' || seccion === 'ticket' || seccion === 'plazos')) || (k === 'pendientes' && seccion === 'revisar')
  const quien = `${catalogo.usuario.nombre} · ${p.rolNombre}`

  return (
    <FinanzasCtx.Provider value={{ catalogo, base, rutaAdmin, soloCaptura }}>
      <div className={`fz-app${soloCaptura ? ' fz-app--solo' : ''}`}>
        {soloCaptura ? (
          <header className="fz-cabecera">
            <Link href={base} className="fz-marca" aria-label={`${marca.nombre} Finanzas: ir al inicio`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marca.wordmark} alt={marca.nombre} />
              <span>finanzas</span>
            </Link>
            <span className="fz-cabecera__quien">
              <span className="fz-avatar" title={quien} aria-label={quien} role="img">{iniciales(catalogo.usuario.nombre)}</span>
              <span className="fz-cabecera__nombre">{catalogo.usuario.nombre}<small>{p.rolNombre}</small></span>
              <a href={`${rutaAdmin}/logout`} className="fz-cabecera__salir">Salir</a>
            </span>
          </header>
        ) : (
          <nav className="fz-subnav" aria-label="Secciones de Finanzas">
            <span className="fz-subnav__titulo">Finanzas</span>
            {visibles.map(([k, l]) => (
              <Link key={k} href={k ? `${base}/${k}` : base} className={activa(k) ? 'is-on' : ''}>{l}</Link>
            ))}
          </nav>
        )}
        <main className="fz-contenido">
          {/* Solo en el inicio, para no estorbar mientras se captura. */}
          {!seccion && <AvisoInstalar nombre="Finanzas" />}
          {pantalla}
        </main>
        {soloCaptura && (
          <nav className="fz-barra" aria-label="Secciones">
            {visibles.filter(([k]) => k !== 'configuracion' && k !== 'saldos' && k !== 'fondos' && k !== 'mover').map(([k, l, ic]) => (
              <Link key={k} href={k === 'registrar' ? `${base}/registrar?tipo=gasto` : k ? `${base}/${k}` : base} className={activa(k) ? 'is-on' : ''} aria-current={activa(k) ? 'page' : undefined}>
                <Icono n={ic} />
                <span>{l}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </FinanzasCtx.Provider>
  )
}
