'use client'

/**
 * Pantallas de Inventario (fase A). Pensadas para el celular: de 320 a 430 px,
 * campos de 16 px, una acción principal por pantalla.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'
import type { ExistenciaFila, ListaMateriales, MaterialConExistencias, MovimientoVista, ResultadoArranqueInventario } from '../../../lib/inventario/tipos'
import type { UnidadBase } from '../../../lib/inventario/reglas'
import { api, Aviso, cantidad, fecha, Ficha, fmt, Icono, NOMBRE_MOVIMIENTO, nuevaClave, Pastilla, useCarga, useInventario, Volver } from './comun'

/* ───────────────────────── Inicio ───────────────────────── */

export function Inicio() {
  const { catalogo, base } = useInventario()
  const p = catalogo.permisos
  const faltan = p.configurar
    ? [!catalogo.proveedores.length && 'proveedores', !catalogo.familias.length && 'familias', !catalogo.ubicaciones.length && 'ubicaciones (bodega y obras)'].filter(Boolean)
    : []
  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">{fecha(catalogo.hoy, true)} · {p.rolNombre}</p>
        <h1 className="fz-h1">Hola, {catalogo.usuario.nombre.split(' ')[0]}</h1>
        <p className="fz-ayuda">{p.alcanceTexto}</p>
      </div>
      {faltan.length > 0 && (
        <Aviso tono="aviso">
          Falta configurar: {faltan.join(', ')}. <Link href={`${base}/configuracion`}>Ir a configuración</Link>
        </Aviso>
      )}
      <div className="fz-acciones">
        <Link className="fz-accion fz-accion--navy" href={`${base}/catalogo`}><span className="fz-accion__ico"><Icono n="buscar" /></span><span>Buscar material<small>{catalogo.totales.materiales} en el catálogo</small></span></Link>
        {p.movimientos && <Link className="fz-accion fz-accion--teal" href={`${base}/registrar?tipo=entrada_compra`}><span className="fz-accion__ico"><Icono n="entra" /></span><span>Entrada de material<small>Llegó una compra</small></span></Link>}
        {p.movimientos && <Link className="fz-accion fz-accion--claro" href={`${base}/registrar?tipo=salida_obra`}><span className="fz-accion__ico"><Icono n="sale" /></span><span>Salida a obra<small>De bodega a una obra</small></span></Link>}
        <Link className="fz-accion fz-accion--claro" href={`${base}/existencias`}><span className="fz-accion__ico"><Icono n="obra" /></span><span>Existencias<small>Qué hay en bodega y en cada obra</small></span></Link>
      </div>
      {p.documentos && catalogo.totales.documentosPorRevisar > 0 && (
        <Aviso tono="info">Hay {catalogo.totales.documentosPorRevisar} documento{catalogo.totales.documentosPorRevisar === 1 ? '' : 's'} por revisar. La pantalla de revisión llega en la siguiente fase.</Aviso>
      )}
      <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
        <h3>Qué hace Inventario</h3>
        <p className="fz-ayuda">Catálogo de materiales, existencias por ubicación y movimientos (fase A). Después: subir cotizaciones y requisiciones, empatarlas con el catálogo, histórico de precios por proveedor, cuadro comparativo y pronóstico del costo de una compra.</p>
      </div>
    </div>
  )
}

/* ───────────────────────── Catálogo ───────────────────────── */

function FilaMaterial({ m }: { m: MaterialConExistencias }) {
  const { base, catalogo } = useInventario()
  const precio = m.precioReferenciaCentavos ?? m.ultimoPrecio?.precioBaseCentavos ?? null
  return (
    <Link className="fz-fila" href={`${base}/material/${m.id}`}>
      <span className="fz-fila__main">
        <span className="fz-fila__t1" style={{ whiteSpace: 'normal' }}>{m.descripcion}</span>
        <span className="fz-fila__t2">{[m.clave, m.marca, m.numeroParte, m.familia?.nombre].filter(Boolean).join(' · ')}</span>
        <span className="fz-fila__pills">
          {m.critico && <Pastilla tono="aviso">Crítico</Pastilla>}
          {!m.activo && <Pastilla tono="gris">Inactivo</Pastilla>}
          {m.existenciaTotal > 0 && <Pastilla tono="ok">{cantidad(m.existenciaTotal, m.unidadBase)} en existencia</Pastilla>}
        </span>
      </span>
      {catalogo.permisos.verPrecios && precio != null && (
        <span className="fz-monto is-neutro">{fmt(precio, true)}<small className="fz-tenue" style={{ display: 'block', fontSize: 12 }}>por {cantidad(1, m.unidadBase).replace('1 ', '')} sin IVA</small></span>
      )}
    </Link>
  )
}

export function Catalogo({ textoInicial }: { textoInicial: string }) {
  const { catalogo, base } = useInventario()
  const p = catalogo.permisos
  const [texto, setTexto] = useState(textoInicial)
  const [buscado, setBuscado] = useState(textoInicial)
  const [familia, setFamilia] = useState<number | null>(null)
  const [pagina, setPagina] = useState(1)
  const { data, error } = useCarga<ListaMateriales>('materiales', { texto: buscado, familia, pagina })
  const [nuevo, setNuevo] = useState(false)
  const padres = catalogo.familias.filter((f) => f.padre == null && f.activa)
  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <h1 className="fz-h1">Catálogo</h1>
        {(p.confirmar || p.configurar) && <button type="button" className="fz-btn fz-btn--navy fz-btn--chico" onClick={() => setNuevo((x) => !x)}>{nuevo ? 'Cerrar' : 'Nuevo material'}</button>}
      </div>
      {nuevo && <NuevoMaterial alCrear={() => { setNuevo(false); setBuscado(texto); setPagina(1) }} />}
      <form
        className="fz-campo"
        onSubmit={(e) => {
          e.preventDefault()
          setBuscado(texto.trim())
          setPagina(1)
        }}
      >
        <span className="fz-etiqueta">Buscar</span>
        <div className="fz-chips" style={{ flexWrap: 'nowrap' }}>
          <input className="fz-input fz-grow" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="tubo PG 2, LAL36350, cable THW 10…" autoComplete="off" inputMode="search" />
          <button type="submit" className="fz-btn fz-btn--claro" aria-label="Buscar"><Icono n="buscar" chico /></button>
        </div>
      </form>
      {padres.length > 0 && (
        <div className="fz-chips">
          <Ficha activa={familia == null} onClick={() => { setFamilia(null); setPagina(1) }}>Todas</Ficha>
          {padres.map((f) => <Ficha key={f.id} activa={familia === f.id} onClick={() => { setFamilia(f.id); setPagina(1) }}>{f.nombre}</Ficha>)}
        </div>
      )}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {data && (
        <>
          <p className="fz-ayuda">{data.total} material{data.total === 1 ? '' : 'es'}{buscado ? ` para «${buscado}»` : ''}.</p>
          <div className="fz-tarjeta fz-lista">
            {data.materiales.length ? data.materiales.map((m) => <FilaMaterial key={m.id} m={m} />) : <div className="fz-vacio">{buscado ? 'Nada con ese texto. Prueba con menos palabras o revisa la familia.' : 'El catálogo está vacío: crece solo al subir cotizaciones y requisiciones, o da de alta un material aquí.'}</div>}
          </div>
          {data.paginas > 1 && (
            <div className="fz-entre">
              <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" disabled={pagina <= 1} onClick={() => setPagina((x) => x - 1)}>Anteriores</button>
              <span className="fz-tenue">{pagina} de {data.paginas}</span>
              <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" disabled={pagina >= data.paginas} onClick={() => setPagina((x) => x + 1)}>Siguientes</button>
            </div>
          )}
        </>
      )}
      <p className="fz-ayuda">Para editar atributos, marca o número de parte, abre el material y usa «Editar en el panel». <Link href={`${base}/existencias`}>Ver existencias</Link>.</p>
    </div>
  )
}

function NuevoMaterial({ alCrear }: { alCrear: () => void }) {
  const { catalogo, base } = useInventario()
  const router = useRouter()
  const [descripcion, setDescripcion] = useState('')
  const [familia, setFamilia] = useState<number | null>(null)
  const [marca, setMarca] = useState('')
  const [numeroParte, setNumeroParte] = useState('')
  const [unidadBase, setUnidadBase] = useState<UnidadBase>('pieza')
  const [critico, setCritico] = useState(false)
  const [longitudTramo, setLongitudTramo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const familias = catalogo.familias.filter((f) => f.activa)
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const r = await api.post<{ id: number; clave: string | null }>('materiales', {
        descripcion, familia, marca: marca || null, numeroParte: numeroParte || null, unidadBase, critico,
        atributos: { longitudTramo: longitudTramo ? Number(longitudTramo) : null },
      })
      alCrear()
      router.push(`${base}/material/${r.id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }
  return (
    <form className="fz-tarjeta fz-pad fz-stack fz-stack--chico" onSubmit={guardar}>
      <h3>Nuevo material</h3>
      {error && <Aviso tono="malo">{error}</Aviso>}
      <label className="fz-campo">
        <span className="fz-etiqueta">Descripción</span>
        <input className="fz-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Tubo conduit galvanizado pared gruesa 2&quot;" required autoComplete="off" />
        <span className="fz-ayuda">Corta y como la dice ELGO. Marca, medida y pared ayudan a distinguir variantes.</span>
      </label>
      <label className="fz-campo">
        <span className="fz-etiqueta">Familia <span className="fz-opcional">opcional</span></span>
        <select className="fz-input" value={familia ?? ''} onChange={(e) => setFamilia(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Sin familia</option>
          {familias.filter((f) => f.padre == null).map((f) => (
            <optgroup key={f.id} label={f.nombre}>
              <option value={f.id}>{f.nombre} (general)</option>
              {familias.filter((h) => h.padre === f.id).map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="fz-chips" style={{ alignItems: 'stretch' }}>
        <label className="fz-campo fz-grow">
          <span className="fz-etiqueta">Marca <span className="fz-opcional">opcional</span></span>
          <input className="fz-input" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Square D" autoComplete="off" />
        </label>
        <label className="fz-campo fz-grow">
          <span className="fz-etiqueta">Número de parte <span className="fz-opcional">opcional</span></span>
          <input className="fz-input" value={numeroParte} onChange={(e) => setNumeroParte(e.target.value)} placeholder="LAL36350" autoComplete="off" />
        </label>
      </div>
      <div className="fz-chips" style={{ alignItems: 'stretch' }}>
        <label className="fz-campo fz-grow">
          <span className="fz-etiqueta">Unidad base</span>
          <select className="fz-input" value={unidadBase} onChange={(e) => setUnidadBase(e.target.value as UnidadBase)}>
            {catalogo.unidades.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </label>
        {unidadBase === 'metro' && (
          <label className="fz-campo fz-grow">
            <span className="fz-etiqueta">Metros por tramo <span className="fz-opcional">tubería</span></span>
            <input className="fz-input" inputMode="decimal" value={longitudTramo} onChange={(e) => setLongitudTramo(e.target.value)} placeholder="3.05" autoComplete="off" />
          </label>
        )}
      </div>
      <label className="fz-chips"><input type="checkbox" checked={critico} onChange={(e) => setCritico(e.target.checked)} /> Crítico: lo revisa un ingeniero antes de comprar (tableros, interruptores)</label>
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--navy" disabled={enviando || descripcion.trim().length < 3}>Guardar material</button>
      </div>
    </form>
  )
}

/* ───────────────────────── Material ───────────────────────── */

export function Material({ id }: { id: number }) {
  const { base, rutaAdmin, catalogo } = useInventario()
  const p = catalogo.permisos
  const { data, error } = useCarga<MaterialConExistencias & { movimientos: MovimientoVista[] }>(`materiales/${id}`)
  if (error) return <div className="fz-stack"><Volver a={`${base}/catalogo`} /><Aviso tono="malo">{error}</Aviso></div>
  if (!data) return <div className="fz-stack"><Volver a={`${base}/catalogo`} /><p className="fz-tenue">Cargando…</p></div>
  const a = data.atributos
  const atributos = [
    a.medida && ['Medida', a.medida], a.calibre && ['Calibre', a.calibre], a.color && ['Color', a.color],
    a.pared && a.pared !== 'na' && ['Pared', a.pared === 'pg' ? 'Gruesa (PG)' : 'Delgada (PD)'],
    a.longitudTramo && ['Por tramo', `${a.longitudTramo} m`], a.pesoPorMetroKg && ['Peso por metro', `${a.pesoPorMetroKg} kg`],
    a.amperes && ['Amperes', `${a.amperes} A`], a.polos && ['Polos', String(a.polos)], a.tension && ['Tensión', a.tension], a.acabado && ['Acabado', a.acabado],
  ].filter(Boolean) as [string, string][]
  return (
    <div className="fz-stack">
      <Volver a={`${base}/catalogo`} etiqueta="Catálogo" />
      <div>
        <p className="fz-eyebrow">{[data.clave, data.familia?.nombre].filter(Boolean).join(' · ')}</p>
        <h1 className="fz-h1">{data.descripcion}</h1>
        <div className="fz-chips" style={{ marginTop: 6 }}>
          {data.critico && <Pastilla tono="aviso">Crítico</Pastilla>}
          {!data.activo && <Pastilla tono="gris">Inactivo</Pastilla>}
          <Pastilla tono="gris">Unidad: {cantidad(1, data.unidadBase).replace('1 ', '')}</Pastilla>
        </div>
      </div>
      <div className="fz-kpis">
        <div className="fz-kpi">
          <span className="fz-kpi__lbl">En existencia (tu alcance)</span>
          <span className="fz-kpi__val">{cantidad(data.existenciaTotal, data.unidadBase)}</span>
        </div>
        {p.verPrecios && (
          <div className="fz-kpi">
            <span className="fz-kpi__lbl">Último precio sin IVA</span>
            <span className="fz-kpi__val">{data.ultimoPrecio ? fmt(data.ultimoPrecio.precioBaseCentavos, true) : '—'}</span>
            <span className="fz-chico fz-tenue">{data.ultimoPrecio ? `${data.ultimoPrecio.proveedor?.nombre ?? ''} · ${fecha(data.ultimoPrecio.fecha, true)}` : 'Llega al confirmar cotizaciones (fase B)'}</span>
          </div>
        )}
      </div>
      {(data.marca || data.numeroParte || atributos.length > 0) && (
        <div className="fz-tarjeta fz-pad">
          <dl className="fz-dl">
            {data.marca && <><dt>Marca</dt><dd>{data.marca}</dd></>}
            {data.numeroParte && <><dt>Número de parte</dt><dd>{data.numeroParte}</dd></>}
            {atributos.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
          </dl>
        </div>
      )}
      {data.existencias.length > 0 && (
        <div className="fz-bloque">
          <div className="fz-bloque__h"><h3>Dónde está</h3></div>
          <div className="fz-tarjeta fz-lista">
            {data.existencias.map((x) => (
              <Link key={x.ubicacion.id} className="fz-fila" href={`${base}/existencias?ubicacion=${x.ubicacion.id}`}>
                <span className="fz-fila__main"><span className="fz-fila__t1">{x.ubicacion.nombre}</span></span>
                <span className="fz-monto is-neutro">{cantidad(x.cantidad, data.unidadBase)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="fz-chips">
        {p.movimientos && <Link className="fz-btn fz-btn--navy fz-btn--chico" href={`${base}/registrar?material=${data.id}&tipo=entrada_compra`}>Registrar movimiento</Link>}
        <Link className="fz-btn fz-btn--claro fz-btn--chico" href={`${base}/movimientos?material=${data.id}`}>Todos sus movimientos</Link>
        {(p.confirmar || p.configurar) && <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/inv-materiales/${data.id}`}>Editar en el panel</a>}
      </div>
      {data.movimientos.length > 0 && (
        <div className="fz-bloque">
          <div className="fz-bloque__h"><h3>Últimos movimientos</h3></div>
          <div className="fz-tarjeta fz-lista">{data.movimientos.slice(0, 10).map((m) => <FilaMovimiento key={m.id} m={m} unidad={data.unidadBase} />)}</div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Existencias ───────────────────────── */

export function Existencias({ ubicacionInicial }: { ubicacionInicial: number | null }) {
  const { catalogo, base } = useInventario()
  const [ubicacion, setUbicacion] = useState<number | null>(ubicacionInicial)
  const [texto, setTexto] = useState('')
  const { data, error } = useCarga<{ filas: ExistenciaFila[]; ubicaciones: { id: number; nombre: string }[] }>('existencias', { ubicacion, texto })
  return (
    <div className="fz-stack">
      <h1 className="fz-h1">Existencias</h1>
      <div className="fz-chips">
        <Ficha activa={ubicacion == null} onClick={() => setUbicacion(null)}>Todas</Ficha>
        {catalogo.ubicaciones.map((u) => <Ficha key={u.id} activa={ubicacion === u.id} onClick={() => setUbicacion(u.id)} punteada={!u.activa}>{u.nombre}</Ficha>)}
      </div>
      <label className="fz-campo">
        <span className="fz-etiqueta">Filtrar por material</span>
        <input className="fz-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="cable, tubo 2, interruptor…" autoComplete="off" inputMode="search" />
      </label>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {data && (
        <div className="fz-tarjeta fz-lista">
          {data.filas.length ? data.filas.map((f) => (
            <Link key={`${f.material.id}-${f.ubicacion.id}`} className="fz-fila" href={`${base}/material/${f.material.id}`}>
              <span className="fz-fila__main">
                <span className="fz-fila__t1">{f.material.nombre}</span>
                <span className="fz-fila__t2">{[f.material.clave, f.ubicacion.nombre].filter(Boolean).join(' · ')}</span>
                {f.porRecuperar && <span className="fz-fila__pills"><Pastilla tono="aviso">Obra terminada: por recuperar a bodega</Pastilla></span>}
              </span>
              <span className={`fz-monto ${f.cantidad < 0 ? '' : 'is-neutro'}`}>{cantidad(f.cantidad, f.material.unidadBase)}</span>
            </Link>
          )) : <div className="fz-vacio">Sin existencias registradas{ubicacion ? ' en esa ubicación' : ''}. Se llenan con entradas por compra y existencias iniciales.</div>}
        </div>
      )}
      <p className="fz-ayuda">Las existencias no se editan: son la suma de los movimientos. Si el conteo físico no coincide, registra un ajuste con su motivo.</p>
    </div>
  )
}

/* ───────────────────────── Movimientos ───────────────────────── */

function FilaMovimiento({ m, unidad }: { m: MovimientoVista; unidad?: string }) {
  const entra = m.tipo === 'entrada_compra' || m.tipo === 'apertura' || m.tipo === 'devolucion'
  const ruta = m.origen && m.destino ? `${m.origen.nombre} → ${m.destino.nombre}` : m.destino ? `→ ${m.destino.nombre}` : m.origen ? `${m.origen.nombre} →` : ''
  return (
    <div className="fz-fila">
      <span className={`fz-fila__ico ${entra ? 'is-entra' : m.tipo === 'traspaso' ? 'is-neutro' : 'is-sale'}`}><Icono n={entra ? 'entra' : m.tipo === 'traspaso' ? 'traspaso' : 'sale'} /></span>
      <span className="fz-fila__main">
        <span className="fz-fila__t1">{unidad ? NOMBRE_MOVIMIENTO[m.tipo] ?? m.tipo : m.material.nombre}</span>
        <span className="fz-fila__t2">{[unidad ? null : NOMBRE_MOVIMIENTO[m.tipo], ruta, fecha(m.fecha, true), m.registradoPor.nombre.split(' ')[0], m.motivo].filter(Boolean).join(' · ')}</span>
        {m.anulado && <span className="fz-fila__pills"><Pastilla tono="malo">Anulado</Pastilla></span>}
      </span>
      <span className={`fz-monto${entra ? ' is-entra' : m.tipo === 'traspaso' ? ' is-neutro' : ''}${m.anulado ? ' is-anulado' : ''}`}>{entra ? '+' : m.tipo === 'traspaso' ? '' : '−'}{unidad ? cantidad(m.cantidad, unidad) : m.cantidad}</span>
    </div>
  )
}

export function Movimientos({ materialInicial, ubicacionInicial }: { materialInicial: number | null; ubicacionInicial: number | null }) {
  const { catalogo, base } = useInventario()
  const [ubicacion, setUbicacion] = useState<number | null>(ubicacionInicial)
  const [pagina, setPagina] = useState(1)
  const { data, error, recargar } = useCarga<{ movimientos: MovimientoVista[]; total: number; paginas: number }>('movimientos', { material: materialInicial, ubicacion, pagina })
  const [anulando, setAnulando] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  async function anular(id: number) {
    try {
      await api.post(`movimientos/${id}/anulacion`, { motivo })
      setAnulando(null)
      setMotivo('')
      recargar()
    } catch (e) {
      setAviso((e as Error).message)
    }
  }
  return (
    <div className="fz-stack">
      <div className="fz-entre"><h1 className="fz-h1">Movimientos</h1>{catalogo.permisos.movimientos && <Link className="fz-btn fz-btn--navy fz-btn--chico" href={`${base}/registrar`}>Registrar</Link>}</div>
      {materialInicial && <Aviso tono="info">Solo los de un material. <Link href={`${base}/movimientos`}>Ver todos</Link></Aviso>}
      <div className="fz-chips">
        <Ficha activa={ubicacion == null} onClick={() => { setUbicacion(null); setPagina(1) }}>Todas</Ficha>
        {catalogo.ubicaciones.map((u) => <Ficha key={u.id} activa={ubicacion === u.id} onClick={() => { setUbicacion(u.id); setPagina(1) }}>{u.nombre}</Ficha>)}
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {aviso && <Aviso tono="malo">{aviso}</Aviso>}
      {data && (
        <div className="fz-tarjeta fz-lista">
          {data.movimientos.length ? data.movimientos.map((m) => (
            <div key={m.id}>
              <FilaMovimiento m={m} />
              {!m.anulado && catalogo.permisos.movimientos && (
                <div style={{ padding: '0 14px 10px' }}>
                  {anulando === m.id ? (
                    <div className="fz-chips">
                      <input className="fz-input fz-grow" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la anulación" autoComplete="off" />
                      <button type="button" className="fz-btn fz-btn--peligro fz-btn--chico" disabled={motivo.trim().length < 3} onClick={() => anular(m.id)}>Anular</button>
                      <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => setAnulando(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <button type="button" className="fz-link" onClick={() => setAnulando(m.id)}>Anular con motivo</button>
                  )}
                </div>
              )}
            </div>
          )) : <div className="fz-vacio">Sin movimientos todavía.</div>}
        </div>
      )}
      {data && data.paginas > 1 && (
        <div className="fz-entre">
          <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" disabled={pagina <= 1} onClick={() => setPagina((x) => x - 1)}>Anteriores</button>
          <span className="fz-tenue">{pagina} de {data.paginas}</span>
          <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" disabled={pagina >= data.paginas} onClick={() => setPagina((x) => x + 1)}>Siguientes</button>
        </div>
      )}
    </div>
  )
}

const TIPOS: [string, string, string][] = [
  ['entrada_compra', 'Entrada por compra', 'Llegó material comprado: entra a bodega o directo a la obra.'],
  ['salida_obra', 'Salida a obra', 'De la bodega (o un vehículo) a una obra.'],
  ['traspaso', 'Traspaso', 'Entre dos ubicaciones cualesquiera.'],
  ['devolucion', 'Devolución', 'Regresa de una obra a la bodega.'],
  ['ajuste', 'Ajuste por conteo', 'El conteo físico no coincide. Escribe el motivo.'],
  ['merma', 'Merma', 'Se perdió, se dañó o se desperdició. Escribe el motivo.'],
  ['apertura', 'Existencia inicial', 'Lo que ya había al arrancar el sistema.'],
]

type UbicacionOpcion = { id: number; nombre: string }
function SelectUbicacion({ valor, alCambiar, lista, etiqueta }: { valor: number | null; alCambiar: (v: number | null) => void; lista: UbicacionOpcion[]; etiqueta: string }) {
  return (
    <label className="fz-campo">
      <span className="fz-etiqueta">{etiqueta}</span>
      <select className="fz-input" value={valor ?? ''} onChange={(e) => alCambiar(e.target.value ? Number(e.target.value) : null)} required>
        <option value="">Elige…</option>
        {lista.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
    </label>
  )
}

export function RegistrarMovimiento({ tipoInicial, materialInicial }: { tipoInicial: string; materialInicial: number | null }) {
  const { catalogo, base } = useInventario()
  const router = useRouter()
  const [tipo, setTipo] = useState(TIPOS.some(([t]) => t === tipoInicial) ? tipoInicial : 'entrada_compra')
  const [elegido, setElegido] = useState<{ id: number; nombre: string; unidad: string } | null>(null)
  const [cambiado, setCambiado] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [buscado, setBuscado] = useState('')
  const [cant, setCant] = useState('')
  const [origen, setOrigen] = useState<number | null>(null)
  const [destino, setDestino] = useState<number | null>(null)
  const [signoAjuste, setSignoAjuste] = useState<'mas' | 'menos'>('menos')
  const [ubicacionAjuste, setUbicacionAjuste] = useState<number | null>(null)
  const [fechaMov, setFechaMov] = useState(catalogo.hoy)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [clave] = useState(nuevaClave)
  const { data: inicial } = useCarga<MaterialConExistencias>(materialInicial ? `materiales/${materialInicial}` : null)
  const { data: resultados } = useCarga<ListaMateriales>(buscado ? 'materiales' : null, { texto: buscado, pagina: 1 })
  /* El material viene de la ficha (?material=) hasta que la persona lo cambia. */
  const material = elegido ?? (!cambiado && inicial ? { id: inicial.id, nombre: inicial.descripcion, unidad: inicial.unidadBase } : null)
  const setMaterial = (m: { id: number; nombre: string; unidad: string } | null) => {
    setElegido(m)
    if (!m) setCambiado(true)
  }

  const activas = catalogo.ubicaciones.filter((u) => u.activa)
  const bodegas = activas.filter((u) => u.tipo !== 'obra')
  const obras = activas.filter((u) => u.tipo === 'obra')
  const necesitaOrigen = tipo === 'salida_obra' || tipo === 'traspaso' || tipo === 'devolucion' || tipo === 'merma'
  const necesitaDestino = tipo === 'entrada_compra' || tipo === 'apertura' || tipo === 'salida_obra' || tipo === 'traspaso' || tipo === 'devolucion'
  const descripcion = TIPOS.find(([t]) => t === tipo)?.[2]

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!material) return setError('Elige el material.')
    const q = Number(String(cant).replace(',', '.'))
    if (!(q > 0)) return setError('Escribe la cantidad.')
    const cuerpo = {
      tipo, material: material.id, cantidad: q, fecha: fechaMov, motivo: motivo || null,
      origen: tipo === 'ajuste' ? (signoAjuste === 'menos' ? ubicacionAjuste : null) : necesitaOrigen ? origen : null,
      destino: tipo === 'ajuste' ? (signoAjuste === 'mas' ? ubicacionAjuste : null) : necesitaDestino ? destino : null,
    }
    setEnviando(true)
    try {
      await api.post('movimientos', cuerpo, clave)
      router.push(`${base}/material/${material.id}`)
    } catch (err) {
      setError((err as Error).message)
      setEnviando(false)
    }
  }

  return (
    <form className="fz-stack" onSubmit={guardar}>
      <Volver a={base} />
      <h1 className="fz-h1">Registrar movimiento</h1>
      <div className="fz-chips">{TIPOS.map(([t, l]) => <Ficha key={t} activa={tipo === t} onClick={() => setTipo(t)}>{l}</Ficha>)}</div>
      <p className="fz-ayuda">{descripcion}</p>
      {error && <Aviso tono="malo">{error}</Aviso>}

      <div className="fz-campo">
        <span className="fz-etiqueta">Material</span>
        {material ? (
          <div className="fz-chips"><Pastilla tono="ok">{material.nombre}</Pastilla><button type="button" className="fz-link" onClick={() => setMaterial(null)}>Cambiar</button></div>
        ) : (
          <>
            <div className="fz-chips" style={{ flexWrap: 'nowrap' }}>
              <input className="fz-input fz-grow" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setBuscado(busqueda.trim()) } }} placeholder="Busca en el catálogo…" autoComplete="off" inputMode="search" />
              <button type="button" className="fz-btn fz-btn--claro" onClick={() => setBuscado(busqueda.trim())} aria-label="Buscar"><Icono n="buscar" chico /></button>
            </div>
            {buscado && resultados && (
              <div className="fz-tarjeta fz-lista" style={{ marginTop: 8 }}>
                {resultados.materiales.slice(0, 8).map((m) => (
                  <button key={m.id} type="button" className="fz-fila" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--mx-line)' }} onClick={() => setMaterial({ id: m.id, nombre: m.descripcion, unidad: m.unidadBase })}>
                    <span className="fz-fila__main"><span className="fz-fila__t1">{m.descripcion}</span><span className="fz-fila__t2">{[m.clave, m.marca, m.numeroParte].filter(Boolean).join(' · ')}</span></span>
                    <span className="fz-monto is-neutro">{m.existenciaTotal ? cantidad(m.existenciaTotal, m.unidadBase) : ''}</span>
                  </button>
                ))}
                {!resultados.materiales.length && <div className="fz-vacio">Nada con ese texto. <Link href={`${base}/catalogo`}>Dar de alta en el catálogo</Link></div>}
              </div>
            )}
          </>
        )}
      </div>

      <label className="fz-campo">
        <span className="fz-etiqueta">Cantidad{material ? ` (${cantidad(1, material.unidad).replace('1 ', '')})` : ''}</span>
        <input className="fz-input" inputMode="decimal" value={cant} onChange={(e) => setCant(e.target.value)} placeholder="0" autoComplete="off" required />
      </label>

      {tipo === 'ajuste' ? (
        <>
          <div className="fz-chips"><Ficha activa={signoAjuste === 'menos'} onClick={() => setSignoAjuste('menos')}>Hay menos de lo registrado</Ficha><Ficha activa={signoAjuste === 'mas'} onClick={() => setSignoAjuste('mas')}>Hay más de lo registrado</Ficha></div>
          <SelectUbicacion valor={ubicacionAjuste} alCambiar={setUbicacionAjuste} lista={activas} etiqueta="Ubicación que se ajusta" />
        </>
      ) : (
        <>
          {necesitaOrigen && <SelectUbicacion valor={origen} alCambiar={setOrigen} lista={tipo === 'devolucion' ? obras : activas} etiqueta="Sale de" />}
          {necesitaDestino && <SelectUbicacion valor={destino} alCambiar={setDestino} lista={tipo === 'salida_obra' ? obras : tipo === 'devolucion' ? bodegas : activas} etiqueta="Llega a" />}
        </>
      )}

      <label className="fz-campo">
        <span className="fz-etiqueta">Fecha</span>
        <input className="fz-input fz-input--fecha" type="date" value={fechaMov} max={catalogo.hoy} onChange={(e) => setFechaMov(e.target.value)} />
      </label>
      <label className="fz-campo">
        <span className="fz-etiqueta">Motivo o nota {tipo === 'ajuste' || tipo === 'merma' ? '' : <span className="fz-opcional">opcional</span>}</span>
        <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === 'merma' ? 'Se dañó al descargar…' : 'Factura, obra, quién lo llevó…'} autoComplete="off" />
      </label>
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--navy fz-btn--bloque" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar movimiento'}</button>
      </div>
      <p className="fz-ayuda">La foto de recepción y la entrada directa desde una cotización confirmada llegan en la fase E.</p>
    </form>
  )
}

/* ───────────────────────── Configuración ───────────────────────── */

function Paso({ n, hecho, titulo, children }: { n: number; hecho?: boolean; titulo: string; children: React.ReactNode }) {
  return (
    <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
      <div className="fz-entre"><h3>{n} · {titulo}</h3>{hecho != null && <Pastilla tono={hecho ? 'ok' : 'aviso'}>{hecho ? 'Hecho' : 'Pendiente'}</Pastilla>}</div>
      {children}
    </div>
  )
}

export function Configuracion() {
  const { catalogo, rutaAdmin } = useInventario()
  const router = useRouter()
  const p = catalogo.permisos
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'malo'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  async function hacer(que: ('proveedores' | 'familias' | 'ubicaciones')[]) {
    setEnviando(true)
    try {
      const r = await api.post<ResultadoArranqueInventario>('arranque', { que })
      setAviso({ tono: 'ok', texto: `Listo: ${r.proveedores} proveedores, ${r.familias} familias y ${r.ubicaciones} ubicaciones nuevas${r.yaExistian.length ? ` (ya existían: ${r.yaExistian.join(', ')})` : ''}.` })
      router.refresh()
    } catch (e) {
      setAviso({ tono: 'malo', texto: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }
  if (!p.configurar && !p.gestionarUsuarios) return <Aviso tono="info">Tu rol no incluye configurar Inventario.</Aviso>
  return (
    <div className="fz-stack">
      <h1 className="fz-h1">Configuración</h1>
      <p className="fz-ayuda">Una sola vez. Todo se puede editar después en el panel (grupo «Inventario»).</p>
      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      {p.configurar && (
        <>
          <Paso n={1} hecho={catalogo.proveedores.length > 0} titulo="Proveedores">
            <p className="fz-ayuda">Crea los conocidos: Eléctrico, M&M (primera opción), Sistelec y Cárdenas (segunda) y «Referencia web». Contactos, clave de cliente y descuentos se completan en el panel.</p>
            <div className="fz-chips">
              {!catalogo.proveedores.length && <button type="button" className="fz-btn fz-btn--navy fz-btn--chico" disabled={enviando} onClick={() => hacer(['proveedores'])}>Crear los sugeridos</button>}
              <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/inv-proveedores`}>Editar proveedores</a>
            </div>
          </Paso>
          <Paso n={2} hecho={catalogo.familias.length > 0} titulo="Familias de materiales">
            <p className="fz-ayuda">Tableros y gabinetes, Interruptores y protecciones, Conductores, Canalización, Conectores y terminales, Fijación y ferretería, Alumbrado, Obra civil, Herrería, Herramienta y EPP, Otros; con sus subfamilias.</p>
            <div className="fz-chips">
              {!catalogo.familias.length && <button type="button" className="fz-btn fz-btn--navy fz-btn--chico" disabled={enviando} onClick={() => hacer(['familias'])}>Crear las sugeridas</button>}
              <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/inv-familias`}>Editar familias</a>
            </div>
          </Paso>
          <Paso n={3} hecho={catalogo.ubicaciones.length > 0} titulo="Ubicaciones">
            <p className="fz-ayuda">La bodega y una ubicación por cada obra activa de Finanzas ({catalogo.obras.length} obra{catalogo.obras.length === 1 ? '' : 's'} hoy). Si después das de alta una obra, vuelve a presionar el botón: solo crea las que falten.</p>
            <div className="fz-chips">
              <button type="button" className="fz-btn fz-btn--navy fz-btn--chico" disabled={enviando} onClick={() => hacer(['ubicaciones'])}>Crear bodega y obras</button>
              <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/inv-ubicaciones`}>Editar ubicaciones</a>
            </div>
          </Paso>
          <Paso n={4} titulo="Parámetros">
            <p className="fz-ayuda">IVA {catalogo.configuracion.tasaIva} % · alerta si un precio cambia más de {catalogo.configuracion.umbralAlertaPrecio} % · precio viejo a los {catalogo.configuracion.diasPrecioViejo} días · confianza mínima de empate {catalogo.configuracion.umbralConfianzaEmpate}.</p>
            <div className="fz-chips"><a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/globals/inv-configuracion`}>Cambiar parámetros</a></div>
          </Paso>
        </>
      )}
      {p.gestionarUsuarios && (
        <Paso n={5} titulo="Roles">
          <p className="fz-ayuda">En cada rol hay un grupo «Inventario» con sus casillas. Sugerencia: Dueño todo; Compras confirmar, requisiciones y movimientos con todas las obras; Administración subir y confirmar; Residente requisiciones y movimientos solo de sus obras.</p>
          <div className="fz-chips"><a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/roles`}>Editar roles</a></div>
        </Paso>
      )}
    </div>
  )
}
