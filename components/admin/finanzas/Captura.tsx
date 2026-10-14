'use client'

/**
 * Registrar una entrada o un gasto: la pantalla que más se usa, pensada para
 * el celular. Solo pide lo necesario; lo demás es opcional o se completa
 * después. Si falta la categoría o la asignación se guarda «pendiente de
 * clasificar»: nadie inventa el dato.
 *
 * Borrador en el teléfono (docs/61): lo que se va capturando se guarda en el
 * propio celular (localStorage) y se recupera si la app se cierra a medias:
 * el iPhone descarga las apps instaladas cuando cambias a otra (WhatsApp, la
 * cámara) y Chrome recarga si jalas la pantalla hacia abajo. Sin esto, un
 * gasto a medio capturar se perdía. El borrador dura 24 horas, es por persona
 * y por tipo (entrada/gasto), se borra al guardar y nunca incluye las fotos
 * (un archivo no se puede guardar ahí; se avisa para volver a tomarla).
 * La nota de voz (docs/62) deja aquí su borrador con `origen: 'voz'`: la
 * persona lo ve lleno, lo corrige y lo guarda. Nunca se guarda solo.
 *
 * «Lo pagué de mi bolsa» (etapa 3, docs/62): un gasto que alguien pagó con su
 * dinero. Se guarda sin cuenta y queda «por reembolsar» a esa persona hasta
 * que administración registra el reembolso desde el detalle.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { aCentavos, sumarDias } from '../../../lib/finanzas/reglas'
import type { OperacionVista } from '../../../lib/finanzas/tipos'
import type { PersonaBreve } from '../../../lib/finanzas/tipos'
import { type Asig, claveBorrador, escribirBorrador, type Estado, leerBorrador, type Medio, type Tipo } from './borrador'
import { SelectorObra } from './clasificacion'
import { api, Aviso, ErrorApi, fecha, Ficha, fmt, Icono, nuevaClave, pastillasDe, Segmentos, useFinanzas } from './comun'

type Listo = { op: OperacionVista; avisoArchivos: string | null; duplicado: boolean }

const MEDIOS: [Medio, string][] = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['cheque', 'Cheque']]
const centavosAPesos = (c: number) => (c / 100).toFixed(2)

/* ───────── pantalla ───────── */

export default function Captura({ tipoInicial, cuentaInicial = null }: { tipoInicial: Tipo; cuentaInicial?: number | null }) {
  const { catalogo, base } = useFinanzas()
  const router = useRouter()
  const { hoy, fechaCorte, cuentas, categorias, actividades, frecuentes } = catalogo
  const p = catalogo.permisos
  const cuentaPre = cuentaInicial != null ? cuentas.find((c) => c.id === cuentaInicial) ?? null : null

  const [tipo, setTipo] = useState<Tipo>(tipoInicial)
  const [importe, setImporte] = useState('')
  const [estado, setEstado] = useState<Estado>('realizado')
  const [cuenta, setCuenta] = useState<number | null>(cuentaPre?.id ?? null)
  const [medio, setMedio] = useState<Medio | null>(cuentaPre ? (cuentaPre.tipo === 'banco' ? 'transferencia' : 'efectivo') : null)
  const [reembolsoA, setReembolsoA] = useState<number | null>(null)
  const [equipo, setEquipo] = useState<PersonaBreve[] | null>(null)
  const [origen, setOrigen] = useState<'manual' | 'voz'>('manual')
  const [concepto, setConcepto] = useState('')
  const [categoria, setCategoria] = useState<number | null>(null)
  const [noSe, setNoSe] = useState(false)
  /* null = no propone; texto = lo que escribió porque no encontró la categoría o la obra (MacAuto docs/63). */
  const [catNueva, setCatNueva] = useState<string | null>(null)
  const [actNueva, setActNueva] = useState<string | null>(null)
  const [asig, setAsig] = useState<Asig | null>(null)
  const [asigTocada, setAsigTocada] = useState(false)
  const [actividad, setActividad] = useState<number | null>(null)
  const [fechaReal, setFechaReal] = useState(hoy)
  const [venceEl, setVenceEl] = useState('')
  const [archivos, setArchivos] = useState<{ file: File; url: string | null }[]>([])
  const [mas, setMas] = useState(false)
  const [contraparte, setContraparte] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<Listo | null>(null)
  const clave = useRef(nuevaClave())
  const [recuperado, setRecuperado] = useState<{ archivos: number; origen: 'manual' | 'voz' } | null>(null)
  const borradorListo = useRef(false)
  const claveB = claveBorrador(catalogo.usuario.id, tipoInicial)

  /* Al abrir: si quedó un borrador de esta persona para este tipo (o lo dejó la nota de voz), se recupera. */
  useEffect(() => {
    const b = leerBorrador(claveB)
    if (b) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- el borrador vive en el teléfono: solo se puede leer después de montar
      setTipo(b.tipo); setImporte(b.importe); setEstado(b.estado); setCuenta(b.cuenta); setMedio(b.medio); setConcepto(b.concepto)
      setCategoria(b.categoria); setNoSe(b.noSe); setAsig(b.asig); setAsigTocada(b.asigTocada)
      setActividad(b.actividad); setFechaReal(b.fechaReal || hoy); setVenceEl(b.venceEl); setMas(b.mas)
      setCatNueva(typeof b.categoriaPropuesta === 'string' ? b.categoriaPropuesta : null); setActNueva(typeof b.actividadPropuesta === 'string' ? b.actividadPropuesta : null)
      setContraparte(b.contraparte); setNotas(b.notas); setReembolsoA(b.reembolsoA ?? null); setOrigen(b.origen === 'voz' ? 'voz' : 'manual')
      setRecuperado({ archivos: b.archivos, origen: b.origen === 'voz' ? 'voz' : 'manual' })
    }
    borradorListo.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  /* Quien ve todos los movimientos puede registrar un gasto que pagó otra persona: se cargan los nombres. */
  useEffect(() => {
    if (estado !== 'propio' || p.ver !== 'todos' || equipo) return
    api.get<PersonaBreve[]>('equipo').then(setEquipo).catch(() => setEquipo([]))
  }, [estado, p.ver, equipo])

  /* Cada cambio se guarda en el teléfono (con una pausa breve para no escribir en cada tecla). */
  const vacio = !importe && !concepto.trim() && categoria == null && !contraparte && !notas && !catNueva && !actNueva
  useEffect(() => {
    if (!borradorListo.current || listo) return
    const t = setTimeout(() => {
      escribirBorrador(claveB, vacio ? null : {
        v: 1, guardadoEn: Date.now(), origen, tipo, importe, estado, cuenta, medio, concepto, categoria, noSe, asig, asigTocada, actividad,
        fechaReal, venceEl, mas, contraparte, notas, reembolsoA, archivos: archivos.length, categoriaPropuesta: catNueva, actividadPropuesta: actNueva,
      })
    }, 300)
    return () => clearTimeout(t)
  }, [claveB, listo, vacio, origen, tipo, importe, estado, cuenta, medio, concepto, categoria, noSe, asig, asigTocada, actividad, fechaReal, venceEl, mas, contraparte, notas, reembolsoA, archivos.length, catNueva, actNueva])

  const total = aCentavos(importe)
  const totalOk = Number.isInteger(total) && total > 0
  const cats = useMemo(() => {
    const lista = categorias.filter((c) => c.tipo === tipo)
    return lista.sort((a, b) => {
      const fa = frecuentes.categorias.indexOf(a.id), fb = frecuentes.categorias.indexOf(b.id)
      return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || a.nombre.localeCompare(b.nombre)
    })
  }, [categorias, tipo, frecuentes.categorias])
  const ctas = useMemo(() => [...cuentas].sort((a, b) => {
    const fa = frecuentes.cuentas.indexOf(a.id), fb = frecuentes.cuentas.indexOf(b.id)
    return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || a.nombre.localeCompare(b.nombre)
  }), [cuentas, frecuentes.cuentas])
  const cat = categorias.find((c) => c.id === categoria) ?? null

  function elegirCategoria(id: number | null) {
    setError(null)
    if (id == null) {
      setCategoria(null)
      setNoSe(true)
      if (!asigTocada) setAsig('pendiente')
      return
    }
    setCategoria(id)
    setNoSe(false)
    setCatNueva(null)
    const c = categorias.find((x) => x.id === id)
    if (!c) return
    /* Con categoría elegida: los conceptos de soporte van a su área sugerida;
       los de obra (sin área sugerida) piden elegir la obra. Si solo hay una
       obra activa, queda elegida. */
    if (!asigTocada) {
      setAsig('actividad')
      if (c.actividadSugerida) setActividad(c.actividadSugerida)
      else {
        const obrasActivas = actividades.filter((a) => a.tipo === 'obra')
        setActividad(obrasActivas.length === 1 ? obrasActivas[0].id : actividad != null && obrasActivas.some((a) => a.id === actividad) ? actividad : null)
      }
    }
  }
  function proponerCategoria() {
    setError(null)
    setCategoria(null)
    setNoSe(false)
    setCatNueva((x) => x ?? '')
  }
  function elegirAsignacion(a: Asig) {
    setAsigTocada(true)
    setAsig(a)
    if (a !== 'actividad') setActNueva(null)
    if (a === 'actividad' && !actividad && cat?.actividadSugerida) setActividad(cat.actividadSugerida)
  }
  function elegirCuenta(id: number) {
    setCuenta(id)
    const c = cuentas.find((x) => x.id === id)
    setMedio(c?.tipo === 'banco' ? 'transferencia' : 'efectivo')
  }
  function agregarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    let url: string | null = null
    try {
      if (f.type.startsWith('image/')) url = URL.createObjectURL(f)
    } catch {
      url = null
    }
    setArchivos((a) => [...a, { file: f, url }])
  }

  function revisar(): string | null {
    if (!totalOk) return 'Escribe el importe (a lo más dos decimales).'
    if (estado === 'realizado' && !cuenta) return tipo === 'entrada' ? 'Elige a qué cuenta o caja entró.' : 'Elige de qué cuenta o caja salió.'
    if (estado === 'propio' && tipo !== 'gasto') return '«De mi bolsa» solo aplica a gastos.'
    if (!concepto.trim()) return 'Escribe un concepto breve.'
    if (catNueva != null && catNueva.trim().length < 3) return 'Escribe el nombre de la categoría que propones (mínimo 3 letras), o elige una de la lista.'
    if (asig === 'actividad' && actNueva != null && actNueva.trim().length < 3) return 'Escribe el nombre de la obra que propones (mínimo 3 letras), o elige una de la lista.'
    if (asig === 'actividad' && !actividad && actNueva == null) return 'Elige la obra o el área.'
    if (fechaReal > hoy) return 'La fecha no puede ser futura.'
    if (fechaCorte && fechaReal < fechaCorte) return `La fecha es anterior al corte (${fecha(fechaCorte, true)}).`
    return null
  }

  async function guardar() {
    if (guardando) return
    const err = revisar()
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setGuardando(true)
    /* Una obra propuesta todavía no existe: se guarda «pendiente de asignar» con la propuesta. */
    const actPropuesta = asig === 'actividad' && actNueva != null ? actNueva.trim() : ''
    const asignacion: Asig = actPropuesta ? 'pendiente' : asig ?? 'pendiente'
    try {
      const propio = estado === 'propio'
      const r = await api.post<{ operacion: OperacionVista; duplicado: boolean }>('operaciones', {
        tipo, importe: centavosAPesos(total), fechaReal, estado: propio ? 'pendiente' : estado, cuenta: estado === 'realizado' ? cuenta : null, medio: estado === 'realizado' ? medio : null,
        concepto: concepto.trim(), categoria: catNueva != null ? null : categoria, asignacion, actividad: asignacion === 'actividad' ? actividad : null,
        categoriaPropuesta: catNueva != null ? catNueva.trim() : null, actividadPropuesta: actPropuesta || null,
        contraparte: contraparte.trim() || null, notas: notas.trim() || null, venceEl: estado === 'pendiente' && venceEl ? venceEl : null,
        pagadoCon: propio ? 'propio' : 'cuenta', reembolsoA: propio ? reembolsoA : null, origen,
      }, clave.current)
      let avisoArchivos: string | null = null
      for (let i = 0; i < archivos.length; i++) {
        try {
          await api.subir(`operaciones/${r.operacion.id}/comprobantes`, archivos[i].file, `${clave.current}-f${i}`)
        } catch (e) {
          avisoArchivos = (e as Error).message
        }
      }
      const op = archivos.length && !avisoArchivos ? { ...r.operacion, evidencia: 'por_revisar' as const } : r.operacion
      escribirBorrador(claveB, null)
      setListo({ op, avisoArchivos, duplicado: r.duplicado })
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar. Revisa tu conexión: reintentar es seguro, no se duplica.')
    } finally {
      setGuardando(false)
    }
  }

  function otro() {
    setImporte(''); setEstado('realizado'); setCuenta(null); setMedio(null); setConcepto(''); setCategoria(null); setNoSe(false)
    setAsig(null); setAsigTocada(false); setActividad(null); setFechaReal(hoy); setVenceEl(''); setArchivos([])
    setMas(false); setContraparte(''); setNotas(''); setError(null); setListo(null); setRecuperado(null); setReembolsoA(null); setOrigen('manual'); setCatNueva(null); setActNueva(null)
    escribirBorrador(claveB, null)
    clave.current = nuevaClave()
    window.scrollTo(0, 0)
  }

  /* ───────── guardado ───────── */
  if (listo) {
    const { op } = listo
    return (
      <div className="fz-stack">
        <div className="fz-listo">
          <span className="fz-listo__ok"><Icono n="check" /></span>
          <h2>{op.tipo === 'entrada' ? 'Entrada registrada' : 'Gasto registrado'}</h2>
          <p className="fz-tenue">{op.folio} · {fmt(op.totalCentavos, true)} · {op.concepto}</p>
          {listo.duplicado && <p className="fz-ayuda">Ya estaba guardado: no se duplicó.</p>}
          <div className="fz-fila__pills">{pastillasDe(op)}</div>
        </div>
        {(op.categoriaPropuesta || op.actividadPropuesta) && (
          <Aviso tono="ok">
            Propusiste {[op.categoriaPropuesta && `la categoría «${op.categoriaPropuesta}»`, op.actividadPropuesta && `la obra «${op.actividadPropuesta}»`].filter(Boolean).join(' y ')}. Queda marcado para que administración lo revise y lo clasifique.
          </Aviso>
        )}
        {listo.avisoArchivos && <Aviso tono="aviso">El movimiento quedó registrado, pero el comprobante no se subió: {listo.avisoArchivos}</Aviso>}
        {op.evidencia === 'pendiente' && !listo.avisoArchivos && <Aviso tono="aviso">Quedó sin comprobante. Puedes subirlo después desde Pendientes; el importe ya no se puede cambiar desde ahí.</Aviso>}
        <div className="fz-acciones-fin">
          <Link className="fz-btn fz-btn--claro" href={`${base}/operacion/${op.id}`}>Ver detalle</Link>
          <button type="button" className="fz-btn fz-btn--claro" onClick={otro}>Registrar otro</button>
          <button type="button" className="fz-btn fz-btn--navy" onClick={() => router.push(base)}>Listo</button>
        </div>
      </div>
    )
  }

  /* ───────── formulario ───────── */
  const entra = tipo === 'entrada'
  const ayer = sumarDias(hoy, -1)
  const actPropuestaVisible = asig === 'actividad' && actNueva != null
  const avisoClasif = !categoria || !asig || asig === 'pendiente' || actPropuestaVisible
  return (
    <div className="fz-captura">
      <div className="fz-stack">
        {recuperado && (
          <Aviso tono={recuperado.origen === 'voz' ? 'info' : 'ok'}>
            {recuperado.origen === 'voz' ? 'Borrador armado desde tu nota de voz. Revisa cada campo antes de guardar.' : 'Recuperamos lo que llevabas capturado.'}
            {recuperado.archivos > 0 ? ' La foto del comprobante no se conserva: vuelve a tomarla.' : ''}{' '}
            <button type="button" className="fz-link" onClick={otro}>Empezar de cero</button>
          </Aviso>
        )}
        {!recuperado && p.registrar && <p className="fz-ayuda"><Link href={`${base}/voz`} className="fz-link">¿Prefieres dictarlo? Nota de voz</Link></p>}
        <Segmentos<Tipo> etiqueta="Tipo" valor={tipo} alCambiar={(v) => { setTipo(v); setCategoria(null); setNoSe(false); if (!asigTocada) setAsig(null) }} opciones={[['gasto', 'Gasto · salió dinero'], ['entrada', 'Entrada · entró dinero']]} />

        <label className="fz-campo">
          <span className="fz-etiqueta">Importe</span>
          <span className="fz-dinero"><span>$</span><input className="fz-input" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0" autoComplete="off" /></span>
        </label>

        <div className="fz-campo">
          <span className="fz-etiqueta">¿Ya {entra ? 'se cobró' : 'se pagó'}?</span>
          <Segmentos<Estado> etiqueta="Estado" valor={estado} alCambiar={(v) => { setEstado(v); if (v !== 'propio') setReembolsoA(null) }}
            opciones={entra ? [['realizado', 'Sí, ya entró'], ['pendiente', 'No, está por cobrar']] : [['realizado', 'Sí, ya salió'], ['propio', 'De mi bolsa'], ['pendiente', 'Por pagar']]} />
        </div>

        {estado === 'propio' ? (
          <div className="fz-campo">
            <span className="fz-etiqueta">¿Quién lo pagó de su bolsa?</span>
            <div className="fz-chips">
              <Ficha activa={reembolsoA == null || reembolsoA === catalogo.usuario.id} onClick={() => setReembolsoA(null)}>Yo · {catalogo.usuario.nombre.split(' ')[0]}</Ficha>
              {(equipo ?? []).filter((x) => x.id !== catalogo.usuario.id).map((x) => <Ficha key={x.id} activa={reembolsoA === x.id} onClick={() => setReembolsoA(x.id)}>{x.nombre}</Ficha>)}
            </div>
            <p className="fz-ayuda">Queda como <b>por reembolsar</b> a esa persona. Administración registra el reembolso desde Pendientes cuando le devuelva el dinero.</p>
          </div>
        ) : estado === 'realizado' ? (
          <div className="fz-campo">
            <span className="fz-etiqueta">{entra ? '¿A qué cuenta o caja entró?' : '¿De qué cuenta o caja salió?'}</span>
            {ctas.length ? (
              <div className="fz-chips">
                {ctas.map((c) => (
                  <Ficha key={c.id} activa={cuenta === c.id} onClick={() => elegirCuenta(c.id)}>
                    {c.nombre}{frecuentes.cuentas.slice(0, 2).includes(c.id) && cuenta !== c.id ? <span className="fz-chip__tag">frecuente</span> : null}
                  </Ficha>
                ))}
              </div>
            ) : <Aviso tono="aviso">Todavía no hay cuentas dadas de alta. Pide a administración que las configure.</Aviso>}
            {cuenta && (
              <>
                <span className="fz-etiqueta fz-etiqueta--sub">Medio de pago</span>
                <Segmentos<Medio> etiqueta="Medio de pago" valor={medio ?? 'efectivo'} alCambiar={setMedio} opciones={MEDIOS} />
                <p className="fz-ayuda">El medio no es la cuenta: una transferencia llega a una cuenta bancaria específica.</p>
              </>
            )}
          </div>
        ) : (
          <label className="fz-campo">
            <span className="fz-etiqueta">Vence <span className="fz-opcional">opcional</span></span>
            <input className="fz-input fz-input--fecha" type="date" value={venceEl} min={hoy} onChange={(e) => setVenceEl(e.target.value)} />
            <span className="fz-ayuda">Queda como compromiso {entra ? 'por cobrar' : 'por pagar'}. No cambia el dinero disponible hasta que se {entra ? 'cobre' : 'pague'}.</span>
          </label>
        )}

        <label className="fz-campo">
          <span className="fz-etiqueta">Concepto breve</span>
          <input className="fz-input" value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={160} placeholder={entra ? 'Ej. Estimación 3 · alumbrado Coatepec' : 'Ej. 500 m de cable THW calibre 10'} />
        </label>

        <div className="fz-campo">
          <span className="fz-etiqueta">Categoría <span className="fz-opcional">¿en qué se {entra ? 'ingresó' : 'gastó'}?</span></span>
          <div className="fz-chips">
            {cats.map((c) => (
              <Ficha key={c.id} activa={categoria === c.id} onClick={() => elegirCategoria(c.id)}>
                {c.nombre}{c.restringida ? <Icono n="candado" chico /> : null}
              </Ficha>
            ))}
            <Ficha punteada activa={catNueva != null} onClick={proponerCategoria}><Icono n="mas" chico />Otra · escribirla</Ficha>
            <Ficha punteada activa={noSe} onClick={() => { setCatNueva(null); elegirCategoria(null) }}>No sé · que lo clasifique administración</Ficha>
          </div>
          {catNueva != null && (
            <div className="fz-nuevo">
              <input className="fz-input" value={catNueva} onChange={(e) => setCatNueva(e.target.value)} maxLength={60} placeholder={entra ? 'Ej. Venta de bases de licitación' : 'Ej. Grúa con canastilla'} aria-label="Categoría que propones" autoFocus />
              <p className="fz-ayuda">Se guarda <b>pendiente de clasificar</b> con tu propuesta y se avisa a administración, que la da de alta o la cambia por una existente.</p>
            </div>
          )}
        </div>

        <div className="fz-campo">
          <span className="fz-etiqueta">¿A qué se asigna?</span>
          <div className="fz-chips">
            {([['actividad', 'Una obra o área'], ['general', entra ? 'General' : 'Gasto general'], ['pendiente', 'No sé todavía']] as [Asig, string][])
              .map(([k, l]) => (
                <Ficha key={k} activa={asig === k} onClick={() => elegirAsignacion(k)}>{l}</Ficha>
              ))}
          </div>
          {asig === 'actividad' && (
            <SelectorObra valor={actividad} propuesta={actNueva} alElegir={(id) => { setActividad(id); setActNueva(null) }} alProponer={(t) => { setActividad(null); setActNueva(t) }} />
          )}
          {asig === 'general' && <p className="fz-ayuda">Es de toda la empresa, no de una obra ni de un área en particular. Cuenta como {entra ? 'entrada' : 'gasto'} del periodo.</p>}
          {asig === 'pendiente' && <p className="fz-ayuda">Se guarda como pendiente de clasificar. Administración lo completa después.</p>}
        </div>

        <div className="fz-campo">
          <span className="fz-etiqueta">Fecha real <span className="fz-opcional">puedes registrar algo de días anteriores</span></span>
          <div className="fz-chips">
            <Ficha activa={fechaReal === hoy} onClick={() => setFechaReal(hoy)}>Hoy</Ficha>
            <Ficha activa={fechaReal === ayer} onClick={() => setFechaReal(ayer)}>Ayer</Ficha>
            <input className="fz-input fz-input--fecha" type="date" aria-label="Otra fecha" value={fechaReal} min={fechaCorte ?? undefined} max={hoy} onChange={(e) => e.target.value && setFechaReal(e.target.value)} />
          </div>
        </div>

        <div className="fz-campo">
          <span className="fz-etiqueta">Comprobante <span className="fz-opcional">opcional ahora · puedes subirlo después</span></span>
          <div className="fz-chips">
            <label className="fz-btn fz-btn--claro fz-btn--chico fz-subir"><Icono n="camara" chico />Tomar foto<input type="file" accept="image/*" capture="environment" onChange={agregarArchivo} /></label>
            <label className="fz-btn fz-btn--claro fz-btn--chico fz-subir"><Icono n="clip" chico />Adjuntar archivo<input type="file" accept="image/*,application/pdf" onChange={agregarArchivo} /></label>
          </div>
          {archivos.map((a, i) => (
            <div className="fz-archivo" key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por next/image */}
              {a.url ? <img src={a.url} alt="" /> : <span className="fz-archivo__ico"><Icono n="archivo" chico /></span>}
              <span className="fz-grow">{a.file.name}</span>
              <button type="button" className="fz-icono-btn" aria-label="Quitar" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))}><Icono n="x" chico /></button>
            </div>
          ))}
        </div>

        <div className="fz-campo">
          <button type="button" className="fz-link" onClick={() => setMas(!mas)}>{mas ? '− Ocultar' : '+ Agregar'} contraparte y notas</button>
          {mas && (
            <>
              <input className="fz-input" value={contraparte} onChange={(e) => setContraparte(e.target.value)} maxLength={160} placeholder="Contraparte (proveedor, tutor del paciente, persona)" aria-label="Contraparte" />
              <textarea className="fz-input" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} placeholder="Notas" aria-label="Notas" rows={3} />
            </>
          )}
        </div>
      </div>

      <div className="fz-pie">
        <div className="fz-resumen">
          <b>{entra ? 'Entrada' : 'Gasto'} {fmt(totalOk ? total : 0)}</b>
          <span>{estado === 'pendiente' ? 'Pendiente' : estado === 'propio' ? `Por reembolsar a ${(equipo ?? []).find((x) => x.id === reembolsoA)?.nombre.split(' ')[0] ?? catalogo.usuario.nombre.split(' ')[0]}` : cuentas.find((c) => c.id === cuenta)?.nombre ?? 'Falta la cuenta'}</span>
          {asig === 'actividad' && actNueva == null && actividad != null && <span>{actividades.find((a) => a.id === actividad)?.nombre}</span>}
          {actPropuestaVisible && actNueva?.trim() && <span>Obra nueva: {actNueva.trim()}</span>}
          <span>{fecha(fechaReal)}</span>
        </div>
        {avisoClasif && (
          <div className="fz-ayuda fz-ayuda--aviso">
            Se guardará como pendiente de clasificar ({catNueva != null ? 'categoría propuesta' : !categoria ? 'sin categoría' : actPropuestaVisible ? 'obra propuesta' : 'sin asignación'}){catNueva != null || actPropuestaVisible ? '. Se avisa a administración.' : '.'}
          </div>
        )}
        {error && <Aviso tono="malo">{error}</Aviso>}
        <button type="button" className={`fz-btn fz-btn--bloque ${entra ? 'fz-btn--teal' : 'fz-btn--navy'}`} disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : entra ? 'Guardar entrada' : 'Guardar gasto'}
        </button>
      </div>
    </div>
  )
}
