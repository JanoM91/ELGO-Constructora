'use client'

/**
 * Elegir categoría y a qué se asigna (una obra o un área de soporte, general o
 * «no sé todavía»), con la opción de escribir una categoría u obra que no
 * existe (heredado de MacAuto, docs/63 y 68 de ese proyecto). Lo usan la
 * captura, la revisión de tickets y los planes de pago.
 */
import React from 'react'
import type { ObraRef, OperacionVista } from '../../../lib/finanzas/tipos'
import { Ficha, Icono, useFinanzas } from './comun'

/**
 * Las obras y las áreas de soporte en dos grupos, más «Otra obra · escribirla».
 * `propuesta` null = no propone; texto = lo que escribe porque no la encontró.
 */
export function SelectorObra({ valor, propuesta, alElegir, alProponer, destacadas = [] }: {
  valor: number | null
  propuesta: string | null
  alElegir: (id: number) => void
  alProponer: (texto: string | null) => void
  /** Obras que coinciden con lo que se dijo (plan de pagos): se muestran primero. */
  destacadas?: ObraRef[]
}) {
  const { catalogo } = useFinanzas()
  const obras = catalogo.actividades.filter((a) => a.tipo === 'obra')
  const areas = catalogo.actividades.filter((a) => a.tipo === 'area')
  const activa = (id: number) => propuesta == null && valor === id
  return (
    <>
      {destacadas.length > 0 && (
        <div className="fz-grupo">
          <span className="fz-grupo__t">¿Cuál de estas?</span>
          <div className="fz-chips">{destacadas.map((a) => <Ficha key={a.id} activa={activa(a.id)} onClick={() => alElegir(a.id)}>{a.nombre}</Ficha>)}</div>
        </div>
      )}
      <div className="fz-grupo">
        <span className="fz-grupo__t">Obras</span>
        <div className="fz-chips">
          {obras.map((a) => <Ficha key={a.id} activa={activa(a.id)} onClick={() => alElegir(a.id)}>{a.nombre}</Ficha>)}
          <Ficha punteada activa={propuesta != null} onClick={() => alProponer(propuesta ?? '')}><Icono n="mas" chico />Otra obra · escribirla</Ficha>
        </div>
        {!obras.length && propuesta == null && <p className="fz-ayuda fz-ayuda--aviso">Todavía no hay obras activas. Administración las da de alta en Finanzas → Obras y áreas, o escribe el nombre de la obra.</p>}
      </div>
      {propuesta != null && (
        <div className="fz-nuevo">
          <input className="fz-input" value={propuesta} onChange={(e) => alProponer(e.target.value)} maxLength={60} placeholder="Ej. Subestación Banderilla" aria-label="Obra que propones" />
          <p className="fz-ayuda">Se guarda <b>pendiente de asignar</b> con tu propuesta y se avisa a administración, que da de alta la obra o la cambia por una existente.</p>
        </div>
      )}
      {areas.length > 0 && (
        <div className="fz-grupo">
          <span className="fz-grupo__t">Áreas de soporte</span>
          <div className="fz-chips">{areas.map((a) => <Ficha key={a.id} activa={activa(a.id)} onClick={() => alElegir(a.id)}>{a.nombre}</Ficha>)}</div>
        </div>
      )}
    </>
  )
}

export type AsigSimple = 'actividad' | 'general' | 'pendiente'

export type Clasif = {
  categoria: number | null
  /** null = no propone; texto = lo que escribió porque no la encontró. */
  categoriaPropuesta: string | null
  asig: AsigSimple
  actividad: number | null
  actividadPropuesta: string | null
}

export const clasifVacia: Clasif = { categoria: null, categoriaPropuesta: null, asig: 'pendiente', actividad: null, actividadPropuesta: null }

/** El estado del editor a partir de una operación ya guardada. */
export function clasifDe(op: OperacionVista): Clasif {
  return {
    categoria: op.categoria?.id ?? null,
    categoriaPropuesta: !op.categoria && op.categoriaPropuesta ? op.categoriaPropuesta : null,
    asig: op.asignacion === 'actividad' || op.actividadPropuesta ? 'actividad' : op.asignacion === 'general' ? 'general' : 'pendiente',
    actividad: op.asignacion === 'actividad' ? op.actividad?.id ?? null : null,
    actividadPropuesta: op.actividadPropuesta || null,
  }
}

/** ¿Falta algo para poder guardar? */
export function errorClasif(c: Clasif): string | null {
  if (c.categoriaPropuesta != null && c.categoriaPropuesta.trim().length < 3) return 'Escribe el nombre de la categoría que propones (mínimo 3 letras), o elige una de la lista.'
  if (c.asig === 'actividad' && c.actividadPropuesta != null && c.actividadPropuesta.trim().length < 3) return 'Escribe el nombre de la obra que propones (mínimo 3 letras), o elige una.'
  if (c.asig === 'actividad' && !c.actividad && c.actividadPropuesta == null) return 'Elige la obra o el área.'
  return null
}

/** Lo que se manda al servidor (completar o plan). */
export function cuerpoClasif(c: Clasif) {
  const actPropuesta = c.asig === 'actividad' && c.actividadPropuesta != null ? c.actividadPropuesta.trim() : ''
  const asignacion = actPropuesta ? 'pendiente' : c.asig
  return {
    categoria: c.categoriaPropuesta != null ? null : c.categoria,
    categoriaPropuesta: c.categoriaPropuesta != null ? c.categoriaPropuesta.trim() : null,
    asignacion,
    actividad: asignacion === 'actividad' ? c.actividad : null,
    actividadPropuesta: actPropuesta || null,
  }
}

export function EditorClasificacion({ tipo, valor, alCambiar, candidatas = [] }: { tipo: 'entrada' | 'gasto'; valor: Clasif; alCambiar: (c: Clasif) => void; candidatas?: ObraRef[] }) {
  const { catalogo } = useFinanzas()
  const cats = catalogo.categorias.filter((c) => c.tipo === tipo)
  const set = (p: Partial<Clasif>) => alCambiar({ ...valor, ...p })
  function elegirCategoria(id: number) {
    const c = cats.find((x) => x.id === id)
    const p: Partial<Clasif> = { categoria: id, categoriaPropuesta: null }
    /* Los conceptos de soporte van a su área; los de obra piden la obra. */
    if (c && valor.asig === 'pendiente') {
      p.asig = 'actividad'
      if (c.actividadSugerida) p.actividad = c.actividadSugerida
    }
    set(p)
  }
  return (
    <div className="fz-stack fz-stack--chico">
      <div className="fz-campo">
        <span className="fz-etiqueta">Categoría</span>
        <div className="fz-chips">
          {cats.map((c) => (
            <Ficha key={c.id} activa={valor.categoriaPropuesta == null && valor.categoria === c.id} onClick={() => elegirCategoria(c.id)}>
              {c.nombre}{c.restringida ? <Icono n="candado" chico /> : null}
            </Ficha>
          ))}
          <Ficha punteada activa={valor.categoriaPropuesta != null} onClick={() => set({ categoria: null, categoriaPropuesta: valor.categoriaPropuesta ?? '' })}><Icono n="mas" chico />Otra · escribirla</Ficha>
          <Ficha punteada activa={valor.categoria == null && valor.categoriaPropuesta == null} onClick={() => set({ categoria: null, categoriaPropuesta: null })}>No sé</Ficha>
        </div>
        {valor.categoriaPropuesta != null && (
          <div className="fz-nuevo">
            <input className="fz-input" value={valor.categoriaPropuesta} onChange={(e) => set({ categoriaPropuesta: e.target.value })} maxLength={60} placeholder={tipo === 'entrada' ? 'Ej. Venta de bases de licitación' : 'Ej. Grúa con canastilla'} aria-label="Categoría que propones" />
            <p className="fz-ayuda">Se avisa a administración para que la dé de alta o la cambie por una existente.</p>
          </div>
        )}
      </div>
      <div className="fz-campo">
        <span className="fz-etiqueta">¿A qué se asigna?</span>
        <div className="fz-chips">
          {([['actividad', 'Una obra o área'], ['general', tipo === 'entrada' ? 'General' : 'Gasto general'], ['pendiente', 'No sé todavía']] as [AsigSimple, string][])
            .map(([k, l]) => <Ficha key={k} activa={valor.asig === k} onClick={() => set({ asig: k, ...(k !== 'actividad' ? { actividadPropuesta: null } : {}) })}>{l}</Ficha>)}
        </div>
        {valor.asig === 'actividad' && (
          <SelectorObra valor={valor.actividad} propuesta={valor.actividadPropuesta} destacadas={candidatas}
            alElegir={(id) => set({ actividad: id, actividadPropuesta: null })} alProponer={(t) => set({ actividad: null, actividadPropuesta: t })} />
        )}
        {valor.asig === 'general' && <p className="fz-ayuda">Es de toda la empresa, no de una obra ni de un área en particular.</p>}
        {valor.asig === 'pendiente' && <p className="fz-ayuda">Queda pendiente de asignar: administración lo completa después.</p>}
      </div>
    </div>
  )
}
