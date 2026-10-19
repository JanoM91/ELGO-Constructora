'use client'

/**
 * El «armazón» de Inventario dentro del panel (misma idea que AppFinanzas):
 * barra de pestañas si la persona entra al panel completo; encabezado y barra
 * inferior de celular si solo captura. Qué pantalla pintar lo decide la ruta
 * (/admin/inventario/catalogo, …) que le pasa VistaInventario.tsx.
 */
import Link from 'next/link'
import React from 'react'
import type { CatalogoInventario } from '../../../lib/inventario/tipos'
import AvisoInstalar from '../finanzas/AvisoInstalar'
import Analizar from './Analizar'
import { Aviso, Icono, iniciales, InventarioCtx } from './comun'
import { Catalogo, Configuracion, Existencias, Inicio, Material, Movimientos, RegistrarMovimiento } from './Paginas'

type Props = {
  catalogo: CatalogoInventario
  ruta: string[]
  query: Record<string, string>
  rutaAdmin: string
  soloCaptura: boolean
  marca: { wordmark: string; nombre: string }
}

export default function AppInventario({ catalogo, ruta, query, rutaAdmin, soloCaptura, marca }: Props) {
  const base = `${rutaAdmin}/inventario`
  const p = catalogo.permisos
  const [seccion, id] = ruta
  const numero = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null)

  let pantalla: React.ReactNode
  if (!seccion) pantalla = <Inicio />
  else if (seccion === 'catalogo') pantalla = <Catalogo key={query.texto ?? ''} textoInicial={query.texto ?? ''} />
  else if (seccion === 'material' && id && /^\d+$/.test(id)) pantalla = <Material key={id} id={Number(id)} />
  else if (seccion === 'existencias') pantalla = <Existencias key={query.ubicacion ?? ''} ubicacionInicial={numero(query.ubicacion)} />
  else if (seccion === 'movimientos') pantalla = <Movimientos key={`${query.material ?? ''}-${query.ubicacion ?? ''}`} materialInicial={numero(query.material)} ubicacionInicial={numero(query.ubicacion)} />
  else if (seccion === 'registrar') pantalla = p.movimientos ? <RegistrarMovimiento key={`${query.tipo ?? ''}-${query.material ?? ''}`} tipoInicial={query.tipo ?? 'entrada_compra'} materialInicial={numero(query.material)} /> : <Aviso tono="info">Tu rol no incluye registrar movimientos de existencias.</Aviso>
  else if (seccion === 'analizar') pantalla = <Analizar />
  else if (seccion === 'configuracion') pantalla = <Configuracion />
  else pantalla = <Aviso tono="aviso">Esa pantalla no existe. <Link href={base}>Volver al inicio de Inventario</Link></Aviso>

  const pestanas: [string, string, string, boolean][] = [
    ['', 'Inicio', 'inicio', true],
    ['analizar', 'Analizar', 'archivo', p.documentos || p.requisiciones || p.confirmar],
    ['catalogo', 'Catálogo', 'buscar', true],
    ['existencias', 'Existencias', 'obra', true],
    ['registrar', 'Registrar', 'mas', p.movimientos],
    ['movimientos', 'Movimientos', 'lista', true],
    ['configuracion', 'Configuración', 'ajustes', p.configurar || p.gestionarUsuarios],
  ]
  const visibles = pestanas.filter((x) => x[3])
  const activa = (k: string) => (seccion ?? '') === k || (k === 'catalogo' && seccion === 'material')
  const quien = `${catalogo.usuario.nombre} · ${p.rolNombre}`

  return (
    <InventarioCtx.Provider value={{ catalogo, base, rutaAdmin, soloCaptura }}>
      <div className={`fz-app${soloCaptura ? ' fz-app--solo' : ''}`}>
        {soloCaptura ? (
          <header className="fz-cabecera">
            <Link href={base} className="fz-marca" aria-label={`${marca.nombre} Inventario: ir al inicio`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marca.wordmark} alt="" aria-hidden="true" />
              <span><b>{marca.nombre}</b> inventario</span>
            </Link>
            <span className="fz-cabecera__quien">
              <span className="fz-avatar" title={quien} aria-label={quien} role="img">{iniciales(catalogo.usuario.nombre)}</span>
              <span className="fz-cabecera__nombre">{catalogo.usuario.nombre}<small>{p.rolNombre}</small></span>
              <a href={`${rutaAdmin}/logout`} className="fz-cabecera__salir">Salir</a>
            </span>
          </header>
        ) : (
          <nav className="fz-subnav" aria-label="Secciones de Inventario">
            <span className="fz-subnav__titulo">Inventario</span>
            {visibles.map(([k, l]) => (
              <Link key={k} href={k ? `${base}/${k}` : base} className={activa(k) ? 'is-on' : ''}>{l}</Link>
            ))}
          </nav>
        )}
        <main className="fz-contenido">
          {!seccion && <AvisoInstalar nombre="Inventario" />}
          {pantalla}
        </main>
        {soloCaptura && (
          <nav className="fz-barra" aria-label="Secciones">
            {visibles.filter(([k]) => k !== 'configuracion').filter(([k], _i, xs) => xs.length <= 5 || k !== 'movimientos').map(([k, l, ic]) => (
              <Link key={k} href={k ? `${base}/${k}` : base} className={activa(k) ? 'is-on' : ''} aria-current={activa(k) ? 'page' : undefined}>
                <Icono n={ic} />
                <span>{l}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </InventarioCtx.Provider>
  )
}
