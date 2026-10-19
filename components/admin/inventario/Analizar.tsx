'use client'

/**
 * «Analizar documento»: sube una cotización, requisición o factura (PDF, foto,
 * Excel o texto de WhatsApp) y en una pantalla ve, renglón por renglón, qué
 * material es, cuánto hay, cuánto falta comprar y cuánto costaría. Los
 * renglones dudosos se deciden aquí (revisión humana obligatoria) y, con un
 * toque, todo se guarda en el histórico. Lógica en lib/inventario/analisis.ts.
 */
import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { excelATexto } from '../../../lib/inventario/excel'
import { normalizarUnidad, type UnidadBase } from '../../../lib/inventario/reglas'
import type { CalculoRenglon, MaterialEnAnalisis, RenglonAnalizado, ResultadoAnalisis, ResultadoGuardarAnalisis, ResumenAnalisis } from '../../../lib/inventario/tipos'
import { ErrorApi } from '../finanzas/comun'
import { api, Aviso, cantidad, fecha, Ficha, fmt, Icono, nuevaClave, Pastilla, useInventario } from './comun'

const LADO_MAX = 2000
const NOMBRE_TIPO: Record<string, string> = { cotizacion: 'Cotización', requisicion: 'Requisición', factura: 'Factura', otro: 'Documento' }

type Decision =
  | { tipo: 'material'; material: MaterialEnAnalisis; metodo: NonNullable<RenglonAnalizado['metodo']>; confianza: number | null; revisado: boolean }
  | { tipo: 'nuevo'; descripcion: string; unidadBase: UnidadBase; familia: number | null }
  | { tipo: 'omitir' }
  | { tipo: 'pendiente' }

type Fila = RenglonAnalizado & { decision: Decision; cantidadEditada: number | null; factorEditado: number | null }

async function prepararFoto(f: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(f)
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(bmp.width * escala)
    lienzo.height = Math.round(bmp.height * escala)
    const g = lienzo.getContext('2d')
    if (!g) throw new Error('sin canvas')
    g.drawImage(bmp, 0, 0, lienzo.width, lienzo.height)
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.85))
    if (!blob) throw new Error('sin blob')
    return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    if (/^image\/(jpeg|png|webp)$/i.test(f.type) && f.size < 4 * 1024 * 1024) return f
    throw new ErrorApi(400, 'No se pudo preparar la foto. Tómala de nuevo.')
  }
}

function filaInicial(r: RenglonAnalizado, umbral: number): Fila {
  const dudoso = r.estado === 'ambiguo' || r.estado === 'nuevo' || (r.estado === 'propuesto' && (r.confianza ?? 0) < umbral)
  const decision: Decision = r.material && r.metodo ? { tipo: 'material', material: r.material, metodo: r.metodo, confianza: r.confianza, revisado: !dudoso } : { tipo: 'pendiente' }
  return { ...r, decision, cantidadEditada: r.cantidad, factorEditado: r.factor }
}

const porDecidir = (f: Fila) => f.decision.tipo === 'pendiente' || (f.decision.tipo === 'material' && !f.decision.revisado)
const sinFactor = (f: Fila) => f.decision.tipo === 'material' && f.factorEditado == null

export default function Analizar() {
  const { catalogo, base } = useInventario()
  const p = catalogo.permisos
  const [archivo, setArchivo] = useState<File | null>(null)
  const [texto, setTexto] = useState('')
  const [proveedorElegido, setProveedorElegido] = useState<number | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [res, setRes] = useState<ResultadoAnalisis | null>(null)

  async function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    try {
      if (/\.(xlsx|xls)$/i.test(f.name) || /spreadsheet|excel/i.test(f.type)) {
        setTexto(await excelATexto(f))
        setArchivo(null)
      } else if (/\.(csv|txt)$/i.test(f.name) || /^text\//.test(f.type)) {
        setTexto((await f.text()).slice(0, 60000))
        setArchivo(null)
      } else if (/^image\//.test(f.type)) setArchivo(await prepararFoto(f))
      else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        if (f.size > 4 * 1024 * 1024) throw new ErrorApi(400, 'El PDF pesa más de 4 MB: súbelo por partes (unas cuantas hojas a la vez).')
        setArchivo(f.type ? f : new File([f], f.name, { type: 'application/pdf' }))
      } else throw new ErrorApi(400, 'Se aceptan PDF, fotos, Excel (.xlsx) o CSV.')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function analizar() {
    setError(null)
    setLeyendo(true)
    try {
      const form = new FormData()
      if (archivo) form.append('archivo', archivo)
      if (texto.trim()) form.append('texto', texto.trim())
      form.append('nombre', archivo?.name ?? 'texto pegado')
      if (proveedorElegido) form.append('proveedor', String(proveedorElegido))
      const r = await fetch('/api/inventario/analizar', { method: 'POST', body: form, credentials: 'same-origin' })
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error((data as { error?: string } | null)?.error || 'No se pudo analizar. Intenta de nuevo.')
      setRes(data as ResultadoAnalisis)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLeyendo(false)
    }
  }

  if (res) return <Resultado key={res.archivoNombre + res.renglones.length} res={res} alOtro={() => { setRes(null); setArchivo(null); setTexto('') }} />

  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <h1 className="fz-h1">Analizar documento</h1>
        <p className="fz-ayuda">Sube una cotización, requisición o factura. Te digo qué material es cada renglón, cuánto hay, cuánto falta comprar y cuánto costaría.</p>
      </div>
      {!p.documentos && !p.requisiciones && !p.confirmar ? (
        <Aviso tono="info">Tu rol no incluye analizar documentos.</Aviso>
      ) : leyendo ? (
        <div className="fz-tarjeta fz-pad fz-centro fz-stack">
          <div className="fz-cargando" aria-hidden="true" />
          <p><b>Leyendo el documento…</b></p>
          <p className="fz-ayuda">Una cotización larga puede tardar hasta un minuto. No cierres esta pantalla.</p>
        </div>
      ) : (
        <>
          <div className="fz-tarjeta fz-pad fz-stack">
            <div className="fz-chips">
              <label className="fz-btn fz-btn--navy fz-subir"><Icono n="clip" chico />Subir PDF, foto o Excel<input type="file" accept="application/pdf,image/*,.xlsx,.xls,.csv,.txt" onChange={elegirArchivo} /></label>
              <label className="fz-btn fz-btn--claro fz-subir"><Icono n="camara" chico />Tomar foto<input type="file" accept="image/*" capture="environment" onChange={elegirArchivo} /></label>
            </div>
            {archivo && (
              <div className="fz-archivo">
                <span className="fz-archivo__ico"><Icono n="clip" chico /></span>
                <span className="fz-grow" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{archivo.name}<small className="fz-tenue" style={{ display: 'block' }}>{(archivo.size / 1024).toFixed(0)} KB</small></span>
                <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => setArchivo(null)}>Quitar</button>
              </div>
            )}
            <label className="fz-campo">
              <span className="fz-etiqueta">{archivo ? 'Notas para la lectura (opcional)' : 'O pega el texto (un mensaje de WhatsApp, un correo…)'}</span>
              <textarea className="fz-input" rows={archivo ? 2 : 6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'10 tubos galv PG 3/4\n20 coples PG 3/4\n2 rollos THW cal 12 negro'} />
            </label>
            <label className="fz-campo">
              <span className="fz-etiqueta">Tienda</span>
              <select className="fz-input" value={proveedorElegido ?? ''} onChange={(e) => setProveedorElegido(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Detectarla del documento</option>
                {catalogo.proveedores.filter((x) => x.activo).map((x) => <option key={x.id} value={x.id}>{x.nombreCorto}</option>)}
              </select>
            </label>
          </div>
          {error && <Aviso tono="malo">{error}</Aviso>}
          <button type="button" className="fz-btn fz-btn--navy fz-btn--bloque" disabled={!archivo && !texto.trim()} onClick={analizar}>Analizar</button>
          <p className="fz-ayuda">Nada se guarda hasta que lo revises y toques «Guardar». <Link href={`${base}/catalogo`}>Ver catálogo</Link></p>
        </>
      )}
    </div>
  )
}

/* ───────────────────────── resultado ───────────────────────── */

function Resultado({ res, alOtro }: { res: ResultadoAnalisis; alOtro: () => void }) {
  const { catalogo } = useInventario()
  const p = catalogo.permisos
  const umbral = catalogo.configuracion.umbralConfianzaEmpate
  const [filas, setFilas] = useState<Fila[]>(() => res.renglones.map((r) => filaInicial(r, umbral)))
  const [calculo, setCalculo] = useState<Map<number, CalculoRenglon>>(() => new Map(res.calculo.map((c) => [c.linea, c])))
  const [resumen, setResumen] = useState<ResumenAnalisis>(res.resumen)
  const [tipo, setTipo] = useState(res.encabezado.tipo)
  const [proveedor, setProveedor] = useState<string>(res.encabezado.proveedor ? String(res.encabezado.proveedor.id) : res.encabezado.proveedorTexto ? 'nuevo' : '')
  const [nombreNuevo, setNombreNuevo] = useState(res.encabezado.proveedorTexto ?? '')
  const [folio, setFolio] = useState(res.encabezado.folio ?? '')
  const [fechaDoc, setFechaDoc] = useState(res.encabezado.fecha ?? catalogo.hoy)
  const [obra, setObra] = useState<number | null>(null)
  const [guardarPrecios, setGuardarPrecios] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'revisar' | 'comprar'>(res.resumen.porRevisar ? 'revisar' : 'todos')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<ResultadoGuardarAnalisis | null>(null)
  const clave = useRef(nuevaClave())
  const vuelta = useRef(0)

  const proveedorId = /^\d+$/.test(proveedor) ? Number(proveedor) : null
  const recalcular = useCallback(async (fs: Fila[], prov: number | null) => {
    const n = ++vuelta.current
    try {
      const r = await api.post<{ calculo: CalculoRenglon[]; resumen: ResumenAnalisis }>('analizar/calcular', {
        proveedor: prov,
        renglones: fs.filter((f) => f.decision.tipo !== 'omitir').map((f) => ({ linea: f.linea, material: f.decision.tipo === 'material' ? f.decision.material.id : null, cantidad: f.cantidadEditada, factor: f.decision.tipo === 'nuevo' ? 1 : f.factorEditado, precioUnitarioCentavos: f.precioUnitarioCentavos })),
      })
      if (n === vuelta.current) {
        setCalculo(new Map(r.calculo.map((c) => [c.linea, c])))
        setResumen(r.resumen)
      }
    } catch (e) {
      if (n === vuelta.current) setError((e as Error).message)
    }
  }, [])

  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) {
      primera.current = false
      return
    }
    const t = setTimeout(() => recalcular(filas, proveedorId), 350)
    return () => clearTimeout(t)
  }, [filas, proveedorId, recalcular])

  const cambiar = (linea: number, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.linea === linea ? { ...f, ...cambio } : f)))
  const pendientes = filas.filter(porDecidir).length
  const faltaFactor = filas.filter(sinFactor).length
  const conPrecios = (tipo === 'cotizacion' || tipo === 'factura') && filas.some((f) => f.precioUnitarioCentavos != null)
  const puedeGuardar = tipo === 'requisicion' ? p.requisiciones || p.confirmar : p.confirmar
  const visibles = filas.filter((f) => (filtro === 'revisar' ? porDecidir(f) || sinFactor(f) : filtro === 'comprar' ? (calculo.get(f.linea)?.faltante ?? 0) > 0 && f.decision.tipo !== 'omitir' : true))

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const r = await api.post<ResultadoGuardarAnalisis>('analizar/guardar', {
        tipo, proveedor: proveedorId ?? (proveedor === 'nuevo' && nombreNuevo.trim() ? { nuevo: nombreNuevo.trim() } : null),
        folio: folio.trim() || null, fecha: fechaDoc || null, vigenciaHasta: res.encabezado.vigenciaHasta, obra,
        subtotalCentavos: res.encabezado.subtotalCentavos, ivaCentavos: res.encabezado.ivaCentavos, totalCentavos: res.encabezado.totalCentavos, cuadra: res.encabezado.cuadra,
        archivo: res.archivo, archivoNombre: res.archivoNombre, guardarPrecios: conPrecios && guardarPrecios, notas: null,
        renglones: filas.map((f) => ({
          linea: f.linea, descripcion: f.descripcion, clave: f.clave, marca: f.marca, cantidad: f.cantidadEditada, unidad: f.unidad,
          precioUnitarioCentavos: f.precioUnitarioCentavos, importeCentavos: f.importeCentavos,
          factor: f.decision.tipo === 'nuevo' ? 1 : f.factorEditado,
          decision: f.decision.tipo === 'material' ? { tipo: 'material', id: f.decision.material.id, metodo: f.decision.revisado && f.decision.confianza == null ? 'manual' : f.decision.metodo, confianza: f.decision.confianza }
            : f.decision.tipo === 'nuevo' ? { tipo: 'nuevo', descripcion: f.decision.descripcion, unidadBase: f.decision.unidadBase, familia: f.decision.familia, marca: f.marca, numeroParte: null }
            : { tipo: 'omitir' },
        })),
      }, clave.current)
      setHecho(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (hecho) {
    return (
      <div className="fz-stack fz-stack--grande">
        <Aviso tono="ok">Guardado: {NOMBRE_TIPO[tipo]} {folio || ''}{hecho.version > 1 ? ` (versión ${hecho.version})` : ''} con {hecho.partidas} renglones{hecho.precios ? `, ${hecho.precios} precios en el histórico` : ''}{hecho.materialesNuevos ? `, ${hecho.materialesNuevos} materiales nuevos` : ''}{hecho.equivalenciasNuevas ? ` y ${hecho.equivalenciasNuevas} claves aprendidas` : ''}.</Aviso>
        {hecho.alertas.length > 0 && (
          <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
            <h3>Cambios de precio</h3>
            {hecho.alertas.map((a, i) => (
              <p key={i} className="fz-chico"><b>{a.material}</b> · {a.proveedor}: {fmt(Math.round(a.antes * 100), true)} → {fmt(Math.round(a.despues * 100), true)} <Pastilla tono={a.variacionPct > 0 ? 'malo' : 'ok'}>{a.variacionPct > 0 ? '+' : ''}{a.variacionPct.toFixed(1)} %</Pastilla></p>
            ))}
          </div>
        )}
        <button type="button" className="fz-btn fz-btn--navy fz-btn--bloque" onClick={alOtro}>Analizar otro documento</button>
      </div>
    )
  }

  const e = res.encabezado
  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <h1 className="fz-h1">{NOMBRE_TIPO[tipo]}{folio ? ` ${folio}` : ''}</h1>
        <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={alOtro}>Otro documento</button>
      </div>

      <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
        <div className="fz-chips">
          {(['cotizacion', 'requisicion', 'factura'] as const).map((t) => <Ficha key={t} activa={tipo === t} onClick={() => setTipo(t)}>{NOMBRE_TIPO[t]}</Ficha>)}
        </div>
        <label className="fz-campo">
          <span className="fz-etiqueta">Tienda</span>
          <select className="fz-input" value={proveedor} onChange={(ev) => setProveedor(ev.target.value)}>
            <option value="">Sin tienda</option>
            {catalogo.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombreCorto}</option>)}
            {(p.confirmar || p.configurar) && <option value="nuevo">Tienda nueva…</option>}
          </select>
        </label>
        {e.proveedorTexto && <p className="fz-chico fz-tenue" style={{ margin: 0 }}>En el documento dice: «{e.proveedorTexto}»</p>}
        {proveedor === 'nuevo' && <input className="fz-input" value={nombreNuevo} onChange={(ev) => setNombreNuevo(ev.target.value)} placeholder="Nombre de la tienda" />}
        <div className="fz-chips" style={{ flexWrap: 'nowrap' }}>
          <label className="fz-campo fz-grow"><span className="fz-etiqueta">Folio</span><input className="fz-input" value={folio} onChange={(ev) => setFolio(ev.target.value)} /></label>
          <label className="fz-campo fz-grow"><span className="fz-etiqueta">Fecha</span><input className="fz-input fz-input--fecha" type="date" value={fechaDoc} onChange={(ev) => setFechaDoc(ev.target.value)} /></label>
        </div>
        {tipo === 'requisicion' && catalogo.obras.length > 0 && (
          <label className="fz-campo">
            <span className="fz-etiqueta">Obra{e.obra ? <span className="fz-tenue"> · leída: «{e.obra}»</span> : null}</span>
            <select className="fz-input" value={obra ?? ''} onChange={(ev) => setObra(ev.target.value ? Number(ev.target.value) : null)}>
              <option value="">Sin obra</option>
              {catalogo.obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
        )}
        {p.verPrecios && e.totalCentavos != null && <p className="fz-chico">Total del documento: <b>{fmt(e.totalCentavos, true)}</b>{e.subtotalCentavos != null ? ` (subtotal ${fmt(e.subtotalCentavos, true)} + IVA)` : ''}{e.preciosConIva ? ' · los precios venían con IVA; aquí se muestran sin IVA' : ''}</p>}
        {e.cuadra === false && <Aviso tono="aviso">La suma de los renglones no cuadra con el subtotal del documento: revisa cantidades y precios.</Aviso>}
        {res.yaGuardado && <Aviso tono="aviso">Este folio de esta tienda ya está en el histórico ({fecha(res.yaGuardado.fecha, true)}, versión {res.yaGuardado.version}). Si lo guardas, queda como versión {res.yaGuardado.version + 1}.</Aviso>}
        {res.dudas.length > 0 && <Aviso tono="info"><b>Notas de la lectura:</b> {res.dudas.join(' · ')}</Aviso>}
      </div>

      <div className="fz-kpis fz-kpis--3">
        <div className="fz-kpi"><span className="fz-kpi__lbl">A comprar</span><span className="fz-kpi__val">{resumen.aComprar} <small className="fz-chico fz-tenue">de {filas.filter((f) => f.decision.tipo !== 'omitir').length}</small></span><span className="fz-chico fz-tenue">{resumen.conExistenciaSuficiente} con existencia suficiente</span></div>
        {p.verPrecios && (
          <div className="fz-kpi fz-kpi--fondo">
            <span className="fz-kpi__lbl">Costo estimado de lo que falta</span>
            <span className="fz-kpi__val">{fmt(resumen.costoEstimadoCentavos)}</span>
            <span className="fz-chico fz-tenue">sin IVA · con el mejor precio conocido{resumen.sinPrecio ? ` · ${resumen.sinPrecio} sin precio` : ''}</span>
          </div>
        )}
        {p.verPrecios && resumen.costoDocCentavos > 0 && (
          <div className="fz-kpi">
            <span className="fz-kpi__lbl">Con los precios de este documento</span>
            <span className="fz-kpi__val">{fmt(resumen.costoDocCentavos)}</span>
            <span className="fz-chico fz-tenue">{resumen.ahorroPosibleCentavos > 0 ? `podrías ahorrar ${fmt(resumen.ahorroPosibleCentavos)} comprando en la tienda más barata` : 'sin IVA'}</span>
          </div>
        )}
      </div>

      <div className="fz-chips">
        <Ficha activa={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos ({filas.length})</Ficha>
        <Ficha activa={filtro === 'revisar'} onClick={() => setFiltro('revisar')}>Por decidir ({pendientes + faltaFactor})</Ficha>
        <Ficha activa={filtro === 'comprar'} onClick={() => setFiltro('comprar')}>A comprar ({resumen.aComprar})</Ficha>
      </div>

      <div className="fz-tarjeta">
        {visibles.length ? visibles.map((f) => <Renglon key={f.linea} f={f} c={calculo.get(f.linea)} proveedor={proveedorId} cambiar={cambiar} />) : <div className="fz-vacio">{filtro === 'revisar' ? 'Nada por decidir.' : 'Nada en esta vista.'}</div>}
      </div>

      {error && <Aviso tono="malo">{error}</Aviso>}
      <div className="fz-pie">
        {conPrecios && p.confirmar && (
          <label className="fz-check"><input type="checkbox" checked={guardarPrecios} onChange={(ev) => setGuardarPrecios(ev.target.checked)} /> Guardar los precios en el histórico{proveedorId == null ? ' (elige la tienda)' : ''}</label>
        )}
        {pendientes > 0 && <p className="fz-chico fz-ayuda--aviso">{pendientes === 1 ? 'Falta 1 renglón' : `Faltan ${pendientes} renglones`} por decidir: elige el material, márcalo como nuevo u omítelo.</p>}
        {faltaFactor > 0 && <p className="fz-chico fz-ayuda--aviso">{faltaFactor === 1 ? '1 renglón' : `${faltaFactor} renglones`} sin conversión de unidad: ábrelo y escribe la equivalencia.</p>}
        {puedeGuardar ? (
          <button type="button" className="fz-btn fz-btn--navy fz-btn--bloque" disabled={guardando || pendientes > 0 || faltaFactor > 0 || (proveedor === 'nuevo' && !nombreNuevo.trim())} onClick={guardar}>
            {guardando ? 'Guardando…' : tipo === 'requisicion' ? 'Guardar requisición' : conPrecios && guardarPrecios ? 'Guardar en el histórico' : 'Guardar documento'}
          </button>
        ) : (
          <p className="fz-ayuda">Puedes consultar el análisis; guardarlo es de Compras.</p>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── un renglón ───────────────────────── */

function Renglon({ f, c, proveedor, cambiar }: { f: Fila; c: CalculoRenglon | undefined; proveedor: number | null; cambiar: (linea: number, cambio: Partial<Fila>) => void }) {
  const { catalogo } = useInventario()
  const p = catalogo.permisos
  const [abierto, setAbierto] = useState(porDecidir(f))
  const d = f.decision
  const unidadDoc = f.unidad ? f.unidad.toLowerCase() : null
  const pastilla =
    d.tipo === 'omitir' ? <Pastilla tono="gris">Omitido</Pastilla>
    : d.tipo === 'nuevo' ? <Pastilla tono="info">Material nuevo</Pastilla>
    : d.tipo === 'pendiente' ? <Pastilla tono="malo">{f.estado === 'ambiguo' ? 'Varias opciones' : 'Sin empate'}</Pastilla>
    : !d.revisado ? <Pastilla tono="aviso">Confirma{d.confianza != null ? ` · ${Math.round(d.confianza * 100)} %` : ''}</Pastilla>
    : f.estado === 'confirmado' && d.material.id === f.material?.id ? <Pastilla tono="ok">Conocido</Pastilla>
    : <Pastilla tono="ok">Empatado</Pastilla>

  const elegir = (m: MaterialEnAnalisis, metodo: NonNullable<RenglonAnalizado['metodo']> = 'manual') => {
    const u = normalizarUnidad(f.unidad)
    const factor = m.id === f.material?.id ? f.factor : !f.unidad || u === m.unidadBase ? 1 : null
    cambiar(f.linea, { decision: { tipo: 'material', material: m, metodo, confianza: m.id === f.material?.id ? f.confianza : null, revisado: true }, factorEditado: factor })
    setAbierto(false)
  }

  return (
    <div className={`fz-revisar${d.tipo === 'omitir' ? ' is-hecho' : ''}`}>
      <button type="button" className="fz-revisar__cab" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto}>
        <span className="fz-tenue fz-chico" style={{ minWidth: 22 }}>{f.linea}</span>
        <span className="fz-grow" style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>{f.descripcion}</span>
          <span className="fz-chico fz-tenue">{[f.cantidadEditada != null ? `${f.cantidadEditada} ${f.unidad ?? ''}`.trim() : 'sin cantidad', f.clave, f.marca, p.verPrecios && f.precioUnitarioCentavos != null ? `${fmt(f.precioUnitarioCentavos, true)} c/u` : null].filter(Boolean).join(' · ')}</span>
          <span className="fz-fila__pills" style={{ marginTop: 4 }}>
            {pastilla}
            {c && d.tipo === 'material' && c.faltante != null && (c.faltante > 0 ? <Pastilla tono="aviso">Comprar {cantidad(c.faltante, d.material.unidadBase)}</Pastilla> : <Pastilla tono="ok">Hay {cantidad(c.existencia, d.material.unidadBase)}</Pastilla>)}
            {c?.vsMismaTienda && Math.abs(c.vsMismaTienda.variacionPct) >= 0.5 && <Pastilla tono={c.vsMismaTienda.variacionPct > 0 ? 'malo' : 'ok'}>{c.vsMismaTienda.variacionPct > 0 ? '+' : ''}{c.vsMismaTienda.variacionPct.toFixed(1)} % vs. su último</Pastilla>}
            {c?.vsOtraTienda && c.vsOtraTienda.diferenciaPct > 0.5 && <Pastilla tono="aviso">{c.vsOtraTienda.proveedor.nombre} {c.vsOtraTienda.diferenciaPct.toFixed(0)} % más barato</Pastilla>}
          </span>
        </span>
      </button>

      {d.tipo === 'material' && (
        <p className="fz-chico" style={{ margin: 0 }}>
          → <b>{d.material.clave}</b> {d.material.descripcion}
          {!d.revisado && <button type="button" className="fz-btn fz-btn--teal fz-btn--chico" style={{ marginLeft: 8 }} onClick={() => cambiar(f.linea, { decision: { ...d, revisado: true } })}>Sí, es este</button>}
        </p>
      )}

      {abierto && (
        <div className="fz-stack fz-stack--chico">
          {d.tipo === 'material' && (
            <div className="fz-chips" style={{ alignItems: 'center' }}>
              <label className="fz-campo" style={{ maxWidth: 130 }}><span className="fz-etiqueta">Cantidad</span><input className="fz-input" inputMode="decimal" value={f.cantidadEditada ?? ''} onChange={(ev) => cambiar(f.linea, { cantidadEditada: Number(ev.target.value.replace(',', '.')) > 0 ? Number(ev.target.value.replace(',', '.')) : null })} /></label>
              {(f.factorEditado == null || (unidadDoc && normalizarUnidad(f.unidad) !== d.material.unidadBase)) && (
                <label className="fz-campo" style={{ maxWidth: 220 }}>
                  <span className="fz-etiqueta">1 {f.unidad ?? 'unidad'} = ¿cuántos {cantidad(1, d.material.unidadBase).replace('1 ', '')}?</span>
                  <input className="fz-input" inputMode="decimal" value={f.factorEditado ?? ''} onChange={(ev) => cambiar(f.linea, { factorEditado: Number(ev.target.value.replace(',', '.')) > 0 ? Number(ev.target.value.replace(',', '.')) : null })} />
                </label>
              )}
            </div>
          )}
          {c && d.tipo === 'material' && <Detalle c={c} unidad={d.material.unidadBase} proveedor={proveedor} />}
          {c?.avisos.map((a, i) => <p key={i} className="fz-chico fz-ayuda--aviso" style={{ margin: 0 }}>{a}</p>)}
          <Elegir f={f} alElegir={elegir} cambiar={cambiar} cerrar={() => setAbierto(false)} />
        </div>
      )}
    </div>
  )
}

function Detalle({ c, unidad, proveedor }: { c: CalculoRenglon; unidad: string; proveedor: number | null }) {
  const { catalogo } = useInventario()
  const u = cantidad(1, unidad).replace('1 ', '')
  return (
    <dl className="fz-dl fz-dl--compacta">
      <dt>Existencia</dt><dd>{cantidad(c.existencia, unidad)}{c.cantidadBase != null ? ` · se piden ${cantidad(c.cantidadBase, unidad)}` : ''}</dd>
      <dt>Falta comprar</dt><dd><b>{c.faltante == null ? '—' : cantidad(c.faltante, unidad)}</b></dd>
      {catalogo.permisos.verPrecios && (
        <>
          {c.precioDocBaseCentavos != null && <><dt>Este documento</dt><dd>{fmt(c.precioDocBaseCentavos, true)} / {u}</dd></>}
          <dt>Precios conocidos</dt>
          <dd>
            {c.porProveedor.length ? c.porProveedor.map((x) => (
              <span key={x.proveedor.id} style={{ display: 'block' }}>{x.proveedor.id === proveedor ? <b>{x.proveedor.nombre}</b> : x.proveedor.nombre}: {fmt(x.precioBaseCentavos, true)} / {u} <span className="fz-tenue">({fecha(x.fecha)})</span></span>
            )) : <span className="fz-tenue">Sin precios todavía</span>}
          </dd>
          {c.costoEstimadoCentavos != null && <><dt>Costo de lo que falta</dt><dd>{fmt(c.costoEstimadoCentavos, true)}{c.estimado.proveedor ? ` en ${c.estimado.proveedor.nombre}` : ''}{c.costoDocCentavos != null && c.costoDocCentavos !== c.costoEstimadoCentavos ? ` · con este documento ${fmt(c.costoDocCentavos, true)}` : ''}</dd></>}
        </>
      )}
    </dl>
  )
}

function Elegir({ f, alElegir, cambiar, cerrar }: { f: Fila; alElegir: (m: MaterialEnAnalisis) => void; cambiar: (linea: number, cambio: Partial<Fila>) => void; cerrar: () => void }) {
  const { catalogo } = useInventario()
  const p = catalogo.permisos
  const [busca, setBusca] = useState('')
  const [hallados, setHallados] = useState<MaterialEnAnalisis[] | null>(null)
  const d = f.decision
  const opciones = [...(f.material && (d.tipo !== 'material' || d.material.id !== f.material.id) ? [f.material] : []), ...f.candidatos].filter((m) => d.tipo !== 'material' || m.id !== d.material.id)
  const unidadSugerida = (normalizarUnidad(f.unidad) ?? 'pieza') as UnidadBase

  async function buscar(ev: React.FormEvent) {
    ev.preventDefault()
    if (busca.trim().length < 2) return
    try {
      setHallados(await api.get<MaterialEnAnalisis[]>('analizar/buscar', { texto: busca.trim() }))
    } catch {
      setHallados([])
    }
  }

  return (
    <div className="fz-stack fz-stack--chico">
      {opciones.length > 0 && <span className="fz-etiqueta">{d.tipo === 'material' ? 'O cámbialo por' : '¿Cuál es?'}</span>}
      {opciones.map((m) => (
        <button key={m.id} type="button" className="fz-elegido" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => alElegir(m)}>
          <span className="fz-grow" style={{ minWidth: 0 }}><b>{m.clave}</b> {m.descripcion}</span>
        </button>
      ))}
      <form className="fz-chips" style={{ flexWrap: 'nowrap' }} onSubmit={buscar}>
        <input className="fz-input fz-grow" value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Buscar en el catálogo" inputMode="search" />
        <button type="submit" className="fz-btn fz-btn--claro" aria-label="Buscar"><Icono n="buscar" chico /></button>
      </form>
      {hallados && (hallados.length ? hallados.map((m) => (
        <button key={m.id} type="button" className="fz-elegido" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => alElegir(m)}>
          <span className="fz-grow" style={{ minWidth: 0 }}><b>{m.clave}</b> {m.descripcion}</span>
        </button>
      )) : <p className="fz-chico fz-tenue">Nada con ese texto.</p>)}
      {d.tipo === 'nuevo' && (
        <div className="fz-stack fz-stack--chico">
          <label className="fz-campo"><span className="fz-etiqueta">Descripción del material nuevo</span><input className="fz-input" value={d.descripcion} onChange={(ev) => cambiar(f.linea, { decision: { ...d, descripcion: ev.target.value } })} /></label>
          <div className="fz-chips" style={{ flexWrap: 'nowrap' }}>
            <label className="fz-campo fz-grow"><span className="fz-etiqueta">Unidad</span>
              <select className="fz-input" value={d.unidadBase} onChange={(ev) => cambiar(f.linea, { decision: { ...d, unidadBase: ev.target.value as UnidadBase } })}>
                {catalogo.unidades.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </label>
            <label className="fz-campo fz-grow"><span className="fz-etiqueta">Familia</span>
              <select className="fz-input" value={d.familia ?? ''} onChange={(ev) => cambiar(f.linea, { decision: { ...d, familia: ev.target.value ? Number(ev.target.value) : null } })}>
                <option value="">Sin familia</option>
                {catalogo.familias.filter((x) => x.activa).map((x) => <option key={x.id} value={x.id}>{x.padre ? '— ' : ''}{x.nombre}</option>)}
              </select>
            </label>
          </div>
          {d.unidadBase !== normalizarUnidad(f.unidad) && f.unidad && <p className="fz-chico fz-tenue">El documento dice «{f.unidad}»: la cantidad y el precio se guardan tal cual en esa unidad.</p>}
        </div>
      )}
      <div className="fz-chips">
        {(p.confirmar || p.configurar) && d.tipo !== 'nuevo' && <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => cambiar(f.linea, { decision: { tipo: 'nuevo', descripcion: f.descripcion, unidadBase: unidadSugerida, familia: null }, factorEditado: 1 })}>Es material nuevo</button>}
        {d.tipo !== 'omitir' && <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => { cambiar(f.linea, { decision: { tipo: 'omitir' } }); cerrar() }}>Omitir renglón</button>}
        {d.tipo === 'omitir' && <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => cambiar(f.linea, { decision: f.material && f.metodo ? { tipo: 'material', material: f.material, metodo: f.metodo, confianza: f.confianza, revisado: false } : { tipo: 'pendiente' } })}>Volver a incluir</button>}
      </div>
    </div>
  )
}
