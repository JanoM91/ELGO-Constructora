'use client'

/**
 * Pantallas de consulta de Finanzas: inicio, movimientos, pendientes, saldos,
 * obras (resultado por obra, propio de ELGO) y configuración inicial. Todo lo que muestran ya viene filtrado por el rol
 * desde el servidor; aquí no se esconde nada «a mano».
 */
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { sumarDias } from '../../../lib/finanzas/reglas'
import type { FilaObra, ListaOperaciones, OperacionVista, Pendientes as PendientesT, PersonaConSesiones, ResultadoObras, Resumen, Saldos as SaldosT } from '../../../lib/finanzas/tipos'
import { api, Aviso, ErrorApi, fecha, Ficha, fmt, Icono, ListaPorDia, nuevaClave, Pastilla, useFinanzas } from './comun'

/**
 * Pide datos a /api/finanzas/<ruta> y los vuelve a pedir cuando cambian los
 * parámetros o cuando alguien llama a `recargar()`.
 */
function useCarga<T>(ruta: string, params?: Record<string, string | number | null | undefined>) {
  const clave = `${ruta}?${JSON.stringify(params ?? {})}`
  const [vuelta, setVuelta] = useState(0)
  const [estado, setEstado] = useState<{ clave: string; data: T | null; error: string | null }>({ clave: '', data: null, error: null })
  useEffect(() => {
    let vivo = true
    api
      .get<T>(ruta, params)
      .then((data) => vivo && setEstado({ clave, data, error: null }))
      .catch((e: Error) => vivo && setEstado({ clave, data: null, error: e.message }))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` ya resume ruta y parámetros
  }, [clave, vuelta])
  const vigente = estado.clave === clave
  return { data: estado.data, error: vigente ? estado.error : null, recargar: () => setVuelta((x) => x + 1) }
}

/* ───────────────────────── Inicio ───────────────────────── */

export function Inicio() {
  const { catalogo, base, rutaAdmin } = useFinanzas()
  const p = catalogo.permisos
  const { data, error } = useCarga<Resumen>('resumen')
  const faltan = data && (p.configurar || p.gestionarUsuarios)
    ? [!data.configurado.catalogos && 'categorías y áreas', !data.configurado.cuentas && 'cuentas y cajas', !data.configurado.fechaCorte && 'fecha de corte', !data.configurado.roles && 'roles'].filter(Boolean)
    : []
  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">{fecha(catalogo.hoy, true)} · {p.rolNombre}</p>
        <h1 className="fz-h1">Hola, {catalogo.usuario.nombre.split(' ')[0]}</h1>
      </div>
      {faltan.length > 0 && (
        <Aviso tono="aviso">
          Falta configurar: {faltan.join(', ')}. <Link href={`${base}/configuracion`}>Ir a configuración</Link>
        </Aviso>
      )}
      {(p.registrar || p.moverDinero) && (
        <div className="fz-acciones">
          {p.registrar && <Link className="fz-accion fz-accion--teal" href={`${base}/registrar?tipo=entrada`}><span className="fz-accion__ico"><Icono n="entra" /></span><span>Registrar entrada<small>Entró dinero</small></span></Link>}
          {p.registrar && <Link className="fz-accion fz-accion--navy" href={`${base}/registrar?tipo=gasto`}><span className="fz-accion__ico"><Icono n="sale" /></span><span>Registrar gasto<small>Salió dinero</small></span></Link>}
          {p.registrar && <Link className="fz-accion fz-accion--claro" href={`${base}/voz`}><span className="fz-accion__ico"><Icono n="mic" /></span><span>Nota de voz<small>Díctalo y revisa el borrador</small></span></Link>}
          {p.registrar && <Link className="fz-accion fz-accion--claro" href={`${base}/ticket`}><span className="fz-accion__ico"><Icono n="ticket" /></span><span>Foto de ticket<small>Un registro por concepto</small></span></Link>}
          {p.registrar && <Link className="fz-accion fz-accion--claro" href={`${base}/plazos`}><span className="fz-accion__ico"><Icono n="calendario" /></span><span>Pagos a plazos<small>Anticipos, estimaciones y pagos parciales</small></span></Link>}
          {p.moverDinero && <Link className="fz-accion fz-accion--claro" href={`${base}/mover`}><span className="fz-accion__ico"><Icono n="traspaso" /></span><span>Mover dinero<small>Traspasos, fondos y socios</small></span></Link>}
        </div>
      )}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {data && (
        <>
          {(data.saldoTotalCentavos != null || data.miFondo || data.teDebenCentavos > 0 || (data.fondosEnManosCentavos != null && data.fondosEnManosCentavos > 0) || (data.porReembolsarCentavos != null && data.porReembolsarCentavos > 0)) && (
            <div className="fz-kpis">
              {data.saldoTotalCentavos != null && (
                <Link className="fz-kpi" href={`${base}/saldos`}>
                  <span className="fz-kpi__lbl">Dinero disponible en cuentas y cajas activas</span>
                  <span className="fz-kpi__val">{fmt(data.saldoTotalCentavos)}</span>
                </Link>
              )}
              {data.miFondo && (
                <Link className="fz-kpi fz-kpi--fondo" href={p.registrar ? `${base}/registrar?tipo=gasto&cuenta=${data.miFondo.cuenta.id}` : `${base}/movimientos?cuenta=${data.miFondo.cuenta.id}`}>
                  <span className="fz-kpi__lbl">Tu fondo · {data.miFondo.cuenta.nombre}</span>
                  <span className="fz-kpi__val">{fmt(data.miFondo.saldoCentavos)}</span>
                  <span className="fz-chico fz-tenue">{p.registrar ? 'Dinero en tu poder · toca para registrar un gasto del fondo' : 'Dinero en tu poder'}</span>
                </Link>
              )}
              {data.teDebenCentavos > 0 && (
                <Link className="fz-kpi" href={`${base}/pendientes?ver=por-reembolsar`}>
                  <span className="fz-kpi__lbl">Te deben por gastos de tu bolsa</span>
                  <span className="fz-kpi__val fz-ambar">{fmt(data.teDebenCentavos)}</span>
                </Link>
              )}
              {data.fondosEnManosCentavos != null && data.fondosEnManosCentavos > 0 && (
                <Link className="fz-kpi" href={`${base}/fondos`}>
                  <span className="fz-kpi__lbl">En manos del equipo (fondos)</span>
                  <span className="fz-kpi__val">{fmt(data.fondosEnManosCentavos)}</span>
                </Link>
              )}
              {data.porReembolsarCentavos != null && data.porReembolsarCentavos > 0 && (
                <Link className="fz-kpi" href={`${base}/pendientes?ver=por-reembolsar`}>
                  <span className="fz-kpi__lbl">Por reembolsar al equipo</span>
                  <span className="fz-kpi__val fz-ambar">{fmt(data.porReembolsarCentavos)}</span>
                </Link>
              )}
            </div>
          )}
          <section className="fz-bloque">
            <div className="fz-entre"><h2 className="fz-h2">Pendientes</h2><Link className="fz-link" href={`${base}/pendientes`}>Ver todo</Link></div>
            <div className="fz-tarjeta fz-lista">
              {[
                ['sin-comprobante', 'Sin comprobante', data.conteos.sinComprobante, true],
                ['por-revisar', 'Comprobantes por revisar', data.conteos.porRevisar, p.revisarComprobantes],
                ['sin-clasificar', 'Sin clasificar', data.conteos.sinClasificar, p.corregir],
                ['por-cobrar-pagar', 'Por cobrar o por pagar', data.conteos.porCobrarOPagar, true],
                ['por-reembolsar', 'Por reembolsar', data.conteos.porReembolsar, true],
                ['por-completar', 'Por completar (tickets y planes)', data.conteos.porCompletar, p.registrar],
              ].filter(([, , , ver]) => ver).map(([k, l, n]) => (
                <Link key={String(k)} className="fz-fila" href={`${base}/pendientes?ver=${k}`}>
                  <span className="fz-fila__main"><span className="fz-fila__t1">{l}</span></span>
                  <Pastilla tono={Number(n) ? 'aviso' : 'gris'}>{String(n)}</Pastilla>
                  <Icono n="flecha" chico />
                </Link>
              ))}
            </div>
          </section>
          <section className="fz-bloque">
            <div className="fz-entre"><h2 className="fz-h2">{p.ver === 'todos' ? 'Últimos movimientos' : 'Tus últimos movimientos'}</h2><Link className="fz-link" href={`${base}/movimientos`}>Ver todos</Link></div>
            <ListaPorDia filas={data.ultimos} hoy={catalogo.hoy} vacio="Todavía no hay movimientos. Usa «Registrar gasto» o «Registrar entrada»." />
          </section>
        </>
      )}
      {!p.panel && <p className="fz-ayuda">¿Necesitas algo más del panel? Pídeselo a administración. <a href={`${rutaAdmin}/logout`}>Cerrar sesión</a></p>}
    </div>
  )
}

/* ───────────────────────── Movimientos ───────────────────────── */

const ESTADOS: [string, string][] = [['', 'Todos'], ['pendientes', 'Por cobrar o pagar'], ['por_reembolsar', 'Por reembolsar'], ['sin_comprobante', 'Sin comprobante'], ['por_revisar', 'Por revisar'], ['sin_clasificar', 'Sin clasificar'], ['anuladas', 'Anulados']]

export function Movimientos({ cuentaInicial, obraInicial = null }: { cuentaInicial: number | null; obraInicial?: number | null }) {
  const { catalogo } = useFinanzas()
  const hoy = catalogo.hoy
  const [texto, setTexto] = useState('')
  const [buscar, setBuscar] = useState('')
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState('')
  /* Desde «Obras» se llega a ver todo lo de una obra: sin el recorte de 30 días. */
  const [desde, setDesde] = useState(obraInicial != null ? catalogo.fechaCorte ?? sumarDias(hoy, -365) : sumarDias(hoy, -30))
  const [hasta, setHasta] = useState(hoy)
  const [cuenta, setCuenta] = useState<number | null>(cuentaInicial)
  const [obra, setObra] = useState<number | null>(obraInicial)
  useEffect(() => {
    const t = setTimeout(() => setBuscar(texto), 300)
    return () => clearTimeout(t)
  }, [texto])
  const { data, error } = useCarga<ListaOperaciones>('operaciones', { desde, hasta, tipo, estado, texto: buscar, cuenta, obra })
  const rango = (dias: number | 'mes') => {
    setHasta(hoy)
    setDesde(dias === 'mes' ? hoy.slice(0, 8) + '01' : sumarDias(hoy, -dias))
  }
  const nombreCuenta = catalogo.cuentas.find((c) => c.id === cuenta)?.nombre
  const nombreObra = catalogo.actividades.find((a) => a.id === obra)?.nombre
  return (
    <div className="fz-stack">
      <h1 className="fz-h1">{catalogo.permisos.ver === 'todos' ? 'Movimientos' : 'Mis movimientos'}</h1>
      {catalogo.permisos.ver !== 'todos' && <Aviso tono="info">Tu alcance: {catalogo.permisos.alcanceTexto}</Aviso>}
      <div className="fz-buscar"><Icono n="buscar" chico /><input className="fz-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por concepto, folio o contraparte" aria-label="Buscar" /></div>
      <div className="fz-chips fz-chips--scroll">
        {[['', 'Todos'], ['entrada', 'Entradas'], ['gasto', 'Gastos'], ['internos', 'Traspasos y socios']].map(([k, l]) => <Ficha key={k} activa={tipo === k} onClick={() => setTipo(k)}>{l}</Ficha>)}
      </div>
      <div className="fz-chips fz-chips--scroll">{ESTADOS.map(([k, l]) => <Ficha key={k} activa={estado === k} onClick={() => setEstado(k)}>{l}</Ficha>)}</div>
      <div className="fz-chips">
        <Ficha activa={desde === hoy && hasta === hoy} onClick={() => rango(0)}>Hoy</Ficha>
        <Ficha activa={desde === sumarDias(hoy, -6) && hasta === hoy} onClick={() => rango(6)}>7 días</Ficha>
        <Ficha activa={desde === hoy.slice(0, 8) + '01' && hasta === hoy} onClick={() => rango('mes')}>Este mes</Ficha>
        <Ficha activa={desde === sumarDias(hoy, -30) && hasta === hoy} onClick={() => rango(30)}>30 días</Ficha>
        <span className="fz-rango"><input className="fz-input fz-input--fecha" type="date" aria-label="Desde" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} /><span className="fz-tenue">a</span><input className="fz-input fz-input--fecha" type="date" aria-label="Hasta" value={hasta} max={hoy} onChange={(e) => e.target.value && setHasta(e.target.value)} /></span>
      </div>
      {(cuenta || obra) && (
        <div className="fz-chips">
          {cuenta && <Ficha activa onClick={() => setCuenta(null)}>Cuenta: {nombreCuenta ?? cuenta} <Icono n="x" chico /></Ficha>}
          {obra && <Ficha activa onClick={() => setObra(null)}>Obra: {nombreObra ?? `#${obra} (terminada)`} <Icono n="x" chico /></Ficha>}
        </div>
      )}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {data && (
        <>
          <div className="fz-entre fz-tenue fz-chico">
            <span>{data.filas.length} registros · {fecha(data.rango.desde)} a {fecha(data.rango.hasta, true)}</span>
            <span className="fz-num">Entradas {fmt(data.totales.entradasCentavos)} · Gastos {fmt(data.totales.gastosCentavos)}</span>
          </div>
          {data.truncado && <Aviso tono="aviso">Hay más de 400 registros en este rango. Acorta las fechas para verlos todos.</Aviso>}
          <ListaPorDia filas={data.filas} hoy={hoy} vacio="No hay movimientos con estos filtros." />
        </>
      )}
      {!data && !error && <div className="fz-tarjeta fz-vacio">Cargando…</div>}
    </div>
  )
}

/* ───────────────────────── Pendientes ───────────────────────── */

type Pestana = 'por-completar' | 'sin-comprobante' | 'por-revisar' | 'sin-clasificar' | 'por-cobrar-pagar' | 'por-reembolsar'

function FilaPendiente({ op, pestana, alSubir }: { op: OperacionVista; pestana: Pestana; alSubir: (op: OperacionVista, f: File) => void }) {
  const { catalogo, base } = useFinanzas()
  const dias = Math.max(0, Math.round((Date.parse(catalogo.hoy) - Date.parse(op.fechaReal)) / 86_400_000))
  const puedeSubir = pestana === 'sin-comprobante' && (op.capturadoPor.id === catalogo.usuario.id || catalogo.permisos.corregir)
  /* Lo que está por completar se abre en la pantalla de revisión (todo el ticket junto). */
  const destino = pestana === 'por-completar' ? `${base}/revisar?${op.grupoTicket ? `grupo=${encodeURIComponent(op.grupoTicket)}` : `op=${op.id}`}` : `${base}/operacion/${op.id}`
  const vence = op.venceEl ? Math.round((Date.parse(op.venceEl) - Date.parse(catalogo.hoy)) / 86_400_000) : null
  return (
    <div className="fz-fila fz-fila--estatica">
      <Link className="fz-fila__main" href={destino}>
        <span className="fz-fila__t1">{op.concepto}</span>
        <span className="fz-fila__t2">{op.folio} · {pestana === 'por-reembolsar' && op.reembolsoA ? `Pagó ${op.reembolsoA.nombre}` : op.capturadoPor.nombre} · {fecha(op.fechaReal)} · <b className={dias >= 8 ? 'fz-rojo' : dias >= 3 ? 'fz-ambar' : ''}>{dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`}</b></span>
        {pestana === 'por-cobrar-pagar' && (op.calendario || op.venceEl) && (
          <span className="fz-fila__t2">{op.calendario?.proxima ? `Próximo pago ${fmt(op.calendario.proxima.faltaCentavos)} · ` : ''}{vence == null ? 'sin fecha' : <b className={vence < 0 ? 'fz-rojo' : vence <= 3 ? 'fz-ambar' : ''}>{vence < 0 ? `venció hace ${-vence} día${vence === -1 ? '' : 's'}` : vence === 0 ? 'vence hoy' : `vence ${fecha(op.venceEl)}`}</b>}</span>
        )}
        {pestana === 'por-completar' && op.grupoTicket && <span className="fz-fila__t2">Del ticket {op.contraparte ? `de ${op.contraparte}` : op.grupoTicket}</span>}
        {pestana === 'sin-clasificar' && (op.categoriaPropuesta || op.actividadPropuesta) && <span className="fz-fila__t2">Propuso {[op.categoriaPropuesta && `la categoría «${op.categoriaPropuesta}»`, op.actividadPropuesta && `la obra «${op.actividadPropuesta}»`].filter(Boolean).join(' y ')}</span>}
      </Link>
      <span className="fz-monto">{fmt(pestana === 'por-cobrar-pagar' || pestana === 'por-reembolsar' ? op.pendienteCentavos : op.totalCentavos)}</span>
      {puedeSubir && (
        <label className="fz-btn fz-btn--claro fz-btn--chico fz-subir"><Icono n="camara" chico />Subir<input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) alSubir(op, f) }} aria-label={`Subir comprobante de ${op.folio}`} /></label>
      )}
      {pestana !== 'sin-comprobante' && <Link className="fz-btn fz-btn--claro fz-btn--chico" href={destino}>{pestana === 'por-completar' ? 'Completar' : 'Abrir'}</Link>}
    </div>
  )
}

export function Pendientes({ inicial }: { inicial: string | null }) {
  const { catalogo } = useFinanzas()
  const p = catalogo.permisos
  const { data, error, recargar } = useCarga<PendientesT>('pendientes')
  const pestanas: [Pestana, string, OperacionVista[] | undefined, boolean][] = [
    ['por-completar', 'Por completar', data?.porCompletar, p.registrar || p.corregir],
    ['sin-comprobante', 'Sin comprobante', data?.sinComprobante, true],
    ['por-revisar', 'Por revisar', data?.porRevisar, p.revisarComprobantes],
    ['sin-clasificar', 'Sin clasificar', data?.sinClasificar, p.corregir],
    ['por-cobrar-pagar', 'Por cobrar o pagar', data?.porCobrarOPagar, true],
    ['por-reembolsar', 'Por reembolsar', data?.porReembolsar, true],
  ]
  const visibles = pestanas.filter((x) => x[3])
  const [pestana, setPestana] = useState<Pestana>((visibles.find((x) => x[0] === inicial)?.[0] ?? 'sin-comprobante') as Pestana)
  /* Las pestañas se desplazan de lado en el celular: la elegida (por ejemplo, al llegar desde el inicio) se trae a la vista. */
  useEffect(() => {
    try {
      document.querySelector('.fz-pestanas .is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' })
    } catch {
      /* navegador viejo: no pasa nada */
    }
  }, [pestana])
  const [responsable, setResponsable] = useState<number | 'todos'>('todos')
  const [antiguedad, setAntiguedad] = useState<'' | '0-2' | '3-7' | '8+'>('')
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'malo'; texto: string } | null>(null)
  const actual = pestanas.find((x) => x[0] === pestana)?.[2] ?? []
  const personas = [...new Map(actual.map((o) => [o.capturadoPor.id, o.capturadoPor.nombre])).entries()]
  const filtrada = actual.filter((o) => {
    if (responsable !== 'todos' && o.capturadoPor.id !== responsable) return false
    const d = Math.round((Date.parse(catalogo.hoy) - Date.parse(o.fechaReal)) / 86_400_000)
    return !antiguedad || (antiguedad === '0-2' && d <= 2) || (antiguedad === '3-7' && d >= 3 && d <= 7) || (antiguedad === '8+' && d >= 8)
  })
  async function subir(op: OperacionVista, f: File) {
    try {
      await api.subir(`operaciones/${op.id}/comprobantes`, f, nuevaClave())
      setAviso({ tono: 'ok', texto: `Comprobante de ${op.folio} subido. Queda por revisar.` })
      recargar()
    } catch (e) {
      setAviso({ tono: 'malo', texto: e instanceof ErrorApi ? e.message : 'No se pudo subir.' })
    }
  }
  return (
    <div className="fz-stack">
      <h1 className="fz-h1">Pendientes</h1>
      <p className="fz-ayuda">{p.revisarComprobantes ? 'Subir un comprobante y revisarlo son pasos distintos: se guarda quién hizo cada uno.' : 'Lo que falta completar en tus movimientos. Puedes subir el comprobante, pero no cambiar el importe.'}</p>
      <div className="fz-pestanas" role="tablist">
        {visibles.map(([k, l, lista]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} className={pestana === k ? 'is-on' : ''} onClick={() => setPestana(k)}>
            {l} <Pastilla tono={lista?.length ? 'aviso' : 'gris'}>{lista ? String(lista.length) : '…'}</Pastilla>
          </button>
        ))}
      </div>
      {(p.ver !== 'propios') && (
        <div className="fz-chips">
          <select className="fz-input fz-input--compacto" aria-label="Responsable" value={String(responsable)} onChange={(e) => setResponsable(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}>
            <option value="todos">Todos los responsables</option>
            {personas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
          {[['', 'Cualquier antigüedad'], ['0-2', '0–2 días'], ['3-7', '3–7 días'], ['8+', '8 días o más']].map(([k, l]) => <Ficha key={k} activa={antiguedad === k} onClick={() => setAntiguedad(k as typeof antiguedad)}>{l}</Ficha>)}
        </div>
      )}
      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!data && !error && <div className="fz-tarjeta fz-vacio">Cargando…</div>}
      {data && (filtrada.length ? (
        <div className="fz-tarjeta fz-lista">{filtrada.map((op) => <FilaPendiente key={op.id} op={op} pestana={pestana} alSubir={subir} />)}</div>
      ) : <div className="fz-tarjeta fz-vacio"><Icono n="check" /> Nada pendiente aquí.</div>)}
    </div>
  )
}

/* ───────────────────────── Saldos ───────────────────────── */

const TIPO_CUENTA: Record<string, string> = { banco: 'Cuenta bancaria', efectivo: 'Efectivo', caja_chica: 'Caja chica', fondo: 'Fondo a cargo de un empleado', otro: 'Otro' }

export function Saldos() {
  const { base } = useFinanzas()
  const { data, error } = useCarga<SaldosT>('saldos')
  return (
    <div className="fz-stack">
      <h1 className="fz-h1">Saldos</h1>
      <p className="fz-ayuda">Saldo = saldo inicial + entradas − salidas realizadas. Los compromisos pendientes no lo cambian.</p>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {data && (
        <>
          <div className="fz-kpi"><span className="fz-kpi__lbl">Disponible en cuentas y cajas activas</span><span className="fz-kpi__val">{fmt(data.totalActivasCentavos)}</span></div>
          <div className="fz-tarjeta fz-lista">
            {data.cuentas.map((x) => (
              <Link className="fz-fila" key={x.cuenta.id} href={`${base}/movimientos?cuenta=${x.cuenta.id}`}>
                <span className="fz-fila__ico"><Icono n="cartera" chico /></span>
                <span className="fz-fila__main"><span className="fz-fila__t1">{x.cuenta.nombre}</span><span className="fz-fila__t2">{TIPO_CUENTA[x.cuenta.tipo] ?? x.cuenta.tipo} · inicial {fmt(x.saldoInicialCentavos)}</span>{!x.cuenta.activa && <span className="fz-fila__pills"><Pastilla tono="gris">Inactiva · conserva su historial</Pastilla></span>}</span>
                <span className="fz-monto">{fmt(x.saldoCentavos)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ───────────────────────── Obras (ELGO) ───────────────────────── */

const SECTOR: Record<string, string> = { publico: 'Obra pública', privado: 'Obra privada' }

function Cifra({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: number; detalle?: React.ReactNode; tono?: 'rojo' | 'ambar' }) {
  return (
    <div className="fz-cifra">
      <span className="fz-cifra__lbl">{etiqueta}</span>
      <span className={`fz-cifra__val${tono === 'rojo' ? ' fz-rojo' : tono === 'ambar' ? ' fz-ambar' : ''}`}>{fmt(valor)}</span>
      {detalle && <span className="fz-cifra__det">{detalle}</span>}
    </div>
  )
}

function TarjetaObra({ f }: { f: FilaObra }) {
  const { base } = useFinanzas()
  const avance = f.contratadoCentavos ? Math.min(100, Math.round((f.cobradoCentavos / f.contratadoCentavos) * 100)) : null
  const margen = f.entradasCentavos > 0 ? Math.round((f.resultadoCentavos / f.entradasCentavos) * 100) : null
  const sub = [f.clave, f.cliente].filter(Boolean).join(' · ')
  return (
    <article className="fz-tarjeta fz-obra">
      <header className="fz-obra__cab">
        <span className="fz-fila__ico"><Icono n={f.tipo === 'obra' ? 'obra' : f.tipo === 'area' ? 'cartera' : 'lista'} chico /></span>
        <div className="fz-grow">
          <h3 className="fz-obra__nombre">{f.nombre}</h3>
          {sub && <p className="fz-fila__t2">{sub}</p>}
          <div className="fz-fila__pills">
            {f.sector && <Pastilla tono="info">{SECTOR[f.sector]}</Pastilla>}
            {f.tipo === 'area' && <Pastilla tono="gris">Área de soporte</Pastilla>}
            {f.tipo === 'pendiente' && <Pastilla tono="aviso">Asígnalos a una obra</Pastilla>}
            {f.tipo === 'obra' && !f.activa && <Pastilla tono="gris">Terminada</Pastilla>}
          </div>
        </div>
        <div className="fz-obra__res">
          <span className="fz-cifra__lbl">{f.tipo === 'obra' ? 'Resultado' : 'Neto'}</span>
          <span className={`fz-obra__monto${f.resultadoCentavos < 0 ? ' fz-rojo' : ''}`}>{fmt(f.resultadoCentavos)}</span>
          {margen != null && f.tipo === 'obra' && <span className="fz-cifra__det">{margen}% de lo facturado</span>}
        </div>
      </header>
      <div className="fz-obra__cifras">
        <Cifra etiqueta="Entradas" valor={f.entradasCentavos} detalle={<>Cobrado {fmt(f.cobradoCentavos)}{f.porCobrarCentavos > 0 && <> · <b className="fz-ambar">por cobrar {fmt(f.porCobrarCentavos)}</b></>}</>} />
        <Cifra etiqueta="Gastos" valor={f.gastosCentavos} detalle={<>Pagado {fmt(f.pagadoCentavos)}{f.porPagarCentavos > 0 && <> · <b className="fz-ambar">por pagar {fmt(f.porPagarCentavos)}</b></>}</>} />
      </div>
      {avance != null && (
        <div className="fz-avance" aria-label={`Cobrado ${avance}% del contrato`}>
          <div className="fz-entre fz-chico"><span className="fz-tenue">Cobrado del contrato ({fmt(f.contratadoCentavos ?? 0)})</span><b className="fz-num">{avance}%</b></div>
          <div className="fz-avance__barra"><span style={{ width: `${avance}%` }} /></div>
        </div>
      )}
      <footer className="fz-entre fz-chico">
        <span className="fz-tenue">{f.operaciones} {f.operaciones === 1 ? 'registro' : 'registros'}{f.ultimo ? ` · último ${fecha(f.ultimo, true)}` : ''} · flujo {fmt(f.flujoCentavos)}</span>
        {f.id != null && f.operaciones > 0 && <Link className="fz-link" href={`${base}/movimientos?obra=${f.id}`}>Ver movimientos</Link>}
      </footer>
    </article>
  )
}

export function Obras() {
  const { catalogo, rutaAdmin } = useFinanzas()
  const hoy = catalogo.hoy
  const [estado, setEstado] = useState<'' | 'terminadas' | 'todas'>('')
  const [periodo, setPeriodo] = useState<'todo' | 'anio' | '90'>('todo')
  const desde = periodo === 'anio' ? `${hoy.slice(0, 4)}-01-01` : periodo === '90' ? sumarDias(hoy, -90) : null
  const { data, error } = useCarga<ResultadoObras>('obras', { estado, desde })
  const obrasF = data?.filas.filter((x) => x.tipo === 'obra') ?? []
  const otras = data?.filas.filter((x) => x.tipo !== 'obra') ?? []
  const resObras = obrasF.reduce((a, x) => a + x.resultadoCentavos, 0)
  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <h1 className="fz-h1">Obras</h1>
        {catalogo.permisos.configurar && <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/fin-actividades/create`}><Icono n="mas" chico />Agregar obra</a>}
      </div>
      <p className="fz-ayuda">Cuánto ha entrado y salido por cada obra. Una entrada o un gasto cuenta desde que se registra, aunque siga por cobrar o por pagar; lo cobrado y lo pagado van debajo. Traspasos y movimientos de socios no cuentan.</p>
      <div className="fz-chips fz-chips--scroll">
        {([['', 'En curso'], ['terminadas', 'Terminadas'], ['todas', 'Todas']] as const).map(([k, l]) => <Ficha key={k} activa={estado === k} onClick={() => setEstado(k)}>{l}</Ficha>)}
        <span className="fz-sep" aria-hidden="true" />
        {([['todo', 'Desde el inicio'], ['anio', 'Este año'], ['90', '90 días']] as const).map(([k, l]) => <Ficha key={k} activa={periodo === k} onClick={() => setPeriodo(k)}>{l}</Ficha>)}
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!data && !error && <div className="fz-tarjeta fz-vacio">Cargando…</div>}
      {data && (
        <>
          {!data.incluyeRestringidas && <Aviso tono="info">Tu rol no ve categorías restringidas (nómina administrativa): el resultado de Oficina sale sin ellas.</Aviso>}
          <div className="fz-kpis fz-kpis--3">
            <div className="fz-kpi"><span className="fz-kpi__lbl">Resultado de las obras mostradas</span><span className={`fz-kpi__val${resObras < 0 ? ' fz-rojo' : ''}`}>{fmt(resObras)}</span></div>
            <div className="fz-kpi"><span className="fz-kpi__lbl">Por cobrar</span><span className="fz-kpi__val fz-ambar">{fmt(data.totales.porCobrarCentavos)}</span></div>
            <div className="fz-kpi"><span className="fz-kpi__lbl">Por pagar o reembolsar</span><span className="fz-kpi__val">{fmt(data.totales.porPagarCentavos)}</span></div>
          </div>
          {obrasF.length ? (
            <div className="fz-obras">{obrasF.map((f) => <TarjetaObra key={`o${f.id}`} f={f} />)}</div>
          ) : (
            <div className="fz-tarjeta fz-vacio">{estado === 'terminadas' ? 'No hay obras terminadas.' : 'Todavía no hay obras. Agrégalas en Finanzas → Obras y áreas.'}</div>
          )}
          {otras.length > 0 && (
            <section className="fz-bloque">
              <h2 className="fz-bloque__h">Soporte y sin asignar</h2>
              <div className="fz-obras">{otras.map((f) => <TarjetaObra key={f.id != null ? `a${f.id}` : f.tipo} f={f} />)}</div>
            </section>
          )}
          <p className="fz-ayuda">Total de todo lo mostrado: entradas {fmt(data.totales.entradasCentavos)} · gastos {fmt(data.totales.gastosCentavos)} · resultado {fmt(data.totales.resultadoCentavos)}{data.rango.desde ? ` · del ${fecha(data.rango.desde, true)} al ${fecha(data.rango.hasta, true)}` : ''}.</p>
        </>
      )}
    </div>
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
  const { catalogo, rutaAdmin } = useFinanzas()
  const p = catalogo.permisos
  const { data, recargar } = useCarga<Resumen>('resumen')
  const [corte, setCorte] = useState(catalogo.fechaCorte ?? '')
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'malo'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  async function hacer(que: 'catalogos' | 'roles' | 'corte') {
    setEnviando(true)
    try {
      const r = await api.post<{ hecho: string[] }>('arranque', { que, fechaCorte: corte })
      setAviso({ tono: 'ok', texto: `Listo: ${r.hecho.join(', ')}. Recarga la página para verlo en los formularios.` })
      recargar()
    } catch (e) {
      setAviso({ tono: 'malo', texto: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }
  const c = data?.configurado
  return (
    <div className="fz-stack">
      <h1 className="fz-h1">Configuración</h1>
      <p className="fz-ayuda">Una sola vez, en este orden. Todo se puede editar después en el panel.</p>
      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      {p.configurar && (
        <Paso n={1} hecho={c?.catalogos} titulo="Categorías y áreas">
          <p className="fz-ayuda">Crea las sugeridas para una constructora: 3 áreas de soporte (Oficina y administración, Concursos y licitaciones, Maquinaria, vehículos y almacén) y 29 categorías (Anticipo de obra, Estimación cobrada, Finiquito, Material eléctrico, Subcontratos, Raya y destajos, Renta de maquinaria, Fianzas, Nómina administrativa restringida…). Luego se editan en el panel.</p>
          <div className="fz-chips">
            {!c?.catalogos && <button type="button" className="fz-btn fz-btn--navy fz-btn--chico" disabled={enviando} onClick={() => hacer('catalogos')}>Crear las sugeridas</button>}
            <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/fin-categorias`}>Editar categorías</a>
            <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/fin-actividades`}>Editar áreas</a>
          </div>
        </Paso>
      )}
      {p.configurar && (
        <Paso n={2} titulo="Obras">
          <p className="fz-ayuda">Da de alta cada obra en curso: nombre corto, cliente, sector y, si lo tienes, el importe contratado con IVA. Cada entrada y cada gasto se asigna a una obra; al terminarla, desactívala y sus números se quedan en «Obras».</p>
          <div className="fz-chips">
            <a className="fz-btn fz-btn--navy fz-btn--chico" href={`${rutaAdmin}/collections/fin-actividades/create`}>Agregar obra</a>
            <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/fin-actividades`}>Ver obras y áreas</a>
          </div>
        </Paso>
      )}
      {p.gestionarUsuarios && (
        <Paso n={3} hecho={c?.roles} titulo="Roles">
          <p className="fz-ayuda">Crea 4 roles editables: Dueño, Administración, Compras (registra y paga compras de todas las obras, sin nómina ni saldos) y Residente de obra (entra directo a registrar desde el celular y ve lo suyo).</p>
          <div className="fz-chips">
            {!c?.roles && <button type="button" className="fz-btn fz-btn--navy fz-btn--chico" disabled={enviando} onClick={() => hacer('roles')}>Crear los sugeridos</button>}
            <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/roles`}>Editar roles</a>
            <a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/users`}>Asignar roles a las personas</a>
          </div>
        </Paso>
      )}
      {p.configurar && (
        <>
          <Paso n={4} hecho={c?.cuentas} titulo="Cuentas y cajas">
            <p className="fz-ayuda">Una por cada lugar donde vive el dinero, con su saldo a la fecha de corte: bancos, efectivo, caja chica y un fondo por cada residente que maneje dinero de obra. El saldo inicial no cuenta como entrada.</p>
            <div className="fz-chips"><a className="fz-btn fz-btn--navy fz-btn--chico" href={`${rutaAdmin}/collections/fin-cuentas/create`}>Agregar cuenta</a><a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/collections/fin-cuentas`}>Ver cuentas</a></div>
          </Paso>
          <Paso n={5} hecho={c?.fechaCorte} titulo="Fecha de corte">
            <p className="fz-ayuda">Desde aquí cuenta Finanzas. Nadie puede registrar algo anterior: eso ya está en los saldos iniciales y llegará con la importación del histórico (etapa 6).</p>
            <div className="fz-chips"><input className="fz-input fz-input--fecha" type="date" value={corte} max={catalogo.hoy} onChange={(e) => setCorte(e.target.value)} aria-label="Fecha de corte" /><button type="button" className="fz-btn fz-btn--navy fz-btn--chico" disabled={enviando || !corte} onClick={() => hacer('corte')}>Guardar fecha</button></div>
          </Paso>
        </>
      )}
      {p.gestionarUsuarios && <Sesiones />}
      {p.gestionarUsuarios && (
        <Paso n={7} titulo="Avisos por correo">
          <p className="fz-ayuda">Quién recibe un correo cuando alguien propone una categoría, obra o área que no existe. Si no eliges a nadie, les llega a los superadministradores y a los roles que pueden «Corregir, clasificar y anular». Lo pendiente también se ve siempre en Pendientes. Necesita RESEND_API_KEY y LEADS_FROM_EMAIL en Vercel.</p>
          <div className="fz-chips"><a className="fz-btn fz-btn--claro fz-btn--chico" href={`${rutaAdmin}/globals/fin-configuracion`}>Elegir quién recibe los avisos</a></div>
        </Paso>
      )}
      {!p.configurar && !p.gestionarUsuarios && <Aviso tono="info">Tu rol no incluye configuración.</Aviso>}
    </div>
  )
}

/**
 * Si se pierde un teléfono (docs/61). La sesión dura 7 días sin pedir
 * contraseña; esta es la forma de cortarla desde el panel, porque cambiar la
 * contraseña no cierra lo que ya estaba abierto.
 */
function Sesiones() {
  const { data, error, recargar } = useCarga<PersonaConSesiones[]>('personas')
  const [elegida, setElegida] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'malo'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const persona = data?.find((x) => String(x.id) === elegida)
  async function cerrar() {
    if (!persona) return
    setEnviando(true)
    try {
      const r = await api.post<{ cerradas: number }>(`personas/${persona.id}/cerrar-sesiones`, {})
      setAviso({ tono: 'ok', texto: `Listo: ${persona.nombre} tendrá que volver a escribir su contraseña (${r.cerradas} ${r.cerradas === 1 ? 'sesión cerrada' : 'sesiones cerradas'}).` })
      setConfirmar(false)
      recargar()
    } catch (e) {
      setAviso({ tono: 'malo', texto: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Paso n={6} titulo="Si se pierde un teléfono">
      <p className="fz-ayuda">La sesión dura 7 días sin pedir contraseña. Si alguien pierde o cambia de teléfono, cierra aquí sus sesiones: en todos sus dispositivos tendrá que volver a entrar con su contraseña. Cámbiale también la contraseña en Usuarios; cambiarla sola no cierra lo que ya estaba abierto.</p>
      <div className="fz-chips">
        <select className="fz-input fz-input--compacto" aria-label="Persona" value={elegida} onChange={(e) => { setElegida(e.target.value); setConfirmar(false); setAviso(null) }}>
          <option value="">Elige a la persona</option>
          {(data ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.sesiones} {x.sesiones === 1 ? 'sesión' : 'sesiones'}</option>)}
        </select>
        {!confirmar ? (
          <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" disabled={!persona} onClick={() => setConfirmar(true)}>Cerrar sus sesiones</button>
        ) : (
          <>
            <button type="button" className="fz-btn fz-btn--peligro fz-btn--chico" disabled={enviando} onClick={cerrar}>{enviando ? 'Cerrando…' : `Sí, cerrar las de ${persona?.nombre.split(' ')[0] ?? ''}`}</button>
            <button type="button" className="fz-btn fz-btn--claro fz-btn--chico" onClick={() => setConfirmar(false)}>Cancelar</button>
          </>
        )}
      </div>
      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}
      {error && <Aviso tono="malo">{error}</Aviso>}
    </Paso>
  )
}
