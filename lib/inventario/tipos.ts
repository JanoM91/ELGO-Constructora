/**
 * Lo que viaja entre el servidor y las pantallas de Inventario.
 *
 * Igual que Finanzas: los importes viajan en CENTAVOS ENTEROS (`...Centavos`)
 * y las cantidades en la unidad base del material. La pantalla solo formatea.
 */
import type { UnidadBase } from './reglas'

export type Ref = { id: number; nombre: string }

export type PermisosInventarioVista = {
  superadmin: boolean
  panel: boolean
  gestionarUsuarios: boolean
  usar: boolean
  documentos: boolean
  confirmar: boolean
  verPrecios: boolean
  requisiciones: boolean
  movimientos: boolean
  configurar: boolean
  obras: 'todas' | 'alcance'
  rolNombre: string
  alcanceTexto: string
}

export type ProveedorVista = {
  id: number
  nombre: string
  nombreCorto: string
  tipo: string
  prioridad: string
  activo: boolean
}

export type FamiliaVista = { id: number; nombre: string; padre: number | null; orden: number; activa: boolean }

export type UbicacionVista = { id: number; nombre: string; tipo: 'bodega' | 'obra' | 'vehiculo' | 'transito'; obra: number | null; activa: boolean }

export type MaterialVista = {
  id: number
  clave: string | null
  descripcion: string
  familia: Ref | null
  marca: string | null
  numeroParte: string | null
  unidadBase: UnidadBase
  critico: boolean
  activo: boolean
  atributos: {
    medida: string | null
    calibre: string | null
    color: string | null
    pared: 'pg' | 'pd' | 'na' | null
    longitudTramo: number | null
    pesoPorMetroKg: number | null
    amperes: number | null
    polos: number | null
    tension: string | null
    acabado: string | null
  }
  ultimoPrecio: { precioBaseCentavos: number; proveedor: Ref | null; fecha: string | null } | null
  precioReferenciaCentavos: number | null
  fechaUltimoMovimiento: string | null
}

export type MaterialConExistencias = MaterialVista & {
  /** Existencia por ubicación (solo las que la persona alcanza). */
  existencias: { ubicacion: Ref; cantidad: number }[]
  existenciaTotal: number
}

export type CatalogoInventario = {
  hoy: string
  configuracion: { tasaIva: number; umbralAlertaPrecio: number; diasPrecioViejo: number; umbralConfianzaEmpate: number; proveedorPreferido: number | null }
  proveedores: ProveedorVista[]
  familias: FamiliaVista[]
  ubicaciones: UbicacionVista[]
  /** Obras activas de Finanzas (para requisiciones y ubicaciones). */
  obras: Ref[]
  unidades: { value: UnidadBase; label: string; abrev: string }[]
  permisos: PermisosInventarioVista
  usuario: { id: number; nombre: string }
  totales: { materiales: number; documentosPorRevisar: number }
}

export type ListaMateriales = {
  materiales: MaterialConExistencias[]
  total: number
  pagina: number
  paginas: number
}

export type ExistenciaFila = { material: Ref & { clave: string | null; unidadBase: UnidadBase }; ubicacion: Ref; cantidad: number; porRecuperar: boolean }

export type MovimientoVista = {
  id: number
  tipo: string
  material: Ref
  cantidad: number
  origen: Ref | null
  destino: Ref | null
  obra: Ref | null
  fecha: string
  motivo: string | null
  registradoPor: Ref
  anulado: boolean
  createdAt: string
}

export type ResultadoArranqueInventario = {
  proveedores: number
  familias: number
  ubicaciones: number
  yaExistian: string[]
}

/* ───────────────────────────── «Analizar documento» ───────────────────────────── */

export type TipoDocumentoAnalizado = 'cotizacion' | 'requisicion' | 'factura' | 'otro'

/** Material tal como lo necesita la pantalla de análisis. */
export type MaterialEnAnalisis = { id: number; clave: string | null; descripcion: string; unidadBase: UnidadBase }

export type EstadoEmpateAnalisis = 'confirmado' | 'propuesto' | 'ambiguo' | 'nuevo' | 'omitido'

/** Un renglón leído del documento con su empate. Los precios ya vienen SIN IVA. */
export type RenglonAnalizado = {
  linea: number
  descripcion: string
  clave: string | null
  marca: string | null
  cantidad: number | null
  unidad: string | null
  precioUnitarioCentavos: number | null
  importeCentavos: number | null
  estado: EstadoEmpateAnalisis
  metodo: 'equivalencia' | 'clave_proveedor' | 'numero_parte' | 'descripcion' | 'manual' | null
  confianza: number | null
  material: MaterialEnAnalisis | null
  candidatos: MaterialEnAnalisis[]
  /** Unidades del documento por unidad base del material; null = no se sabe convertir. */
  factor: number | null
}

/** Lo que se calcula por renglón con el material elegido. */
export type CalculoRenglon = {
  linea: number
  cantidadBase: number | null
  existencia: number
  faltante: number | null
  /** Precio del documento por unidad base, sin IVA. */
  precioDocBaseCentavos: number | null
  estimado: { precioBaseCentavos: number | null; proveedor: Ref | null; fecha: string | null; regla: string; viejo: boolean }
  /** Último precio de cada tienda (sin IVA, por unidad base). */
  porProveedor: { proveedor: Ref; precioBaseCentavos: number; fecha: string }[]
  /** Contra el último precio de la MISMA tienda del documento. */
  vsMismaTienda: { precioBaseCentavos: number; fecha: string; variacionPct: number } | null
  /** Contra la tienda más barata distinta a la del documento. */
  vsOtraTienda: { proveedor: Ref; precioBaseCentavos: number; fecha: string; diferenciaPct: number } | null
  /** Costo de comprar el faltante: con el precio del documento y con el mejor conocido. */
  costoDocCentavos: number | null
  costoEstimadoCentavos: number | null
  avisos: string[]
}

export type ResumenAnalisis = {
  renglones: number
  conMaterial: number
  porRevisar: number
  conExistenciaSuficiente: number
  aComprar: number
  costoDocCentavos: number
  costoEstimadoCentavos: number
  /** Cuánto se ahorraría comprando en la tienda más barata conocida los renglones donde esta cotización sale más cara. */
  ahorroPosibleCentavos: number
  sinPrecio: number
  ivaPct: number
}

export type EncabezadoAnalisis = {
  tipo: TipoDocumentoAnalizado
  proveedorTexto: string | null
  proveedor: Ref | null
  folio: string | null
  fecha: string | null
  vigenciaHasta: string | null
  subtotalCentavos: number | null
  ivaCentavos: number | null
  totalCentavos: number | null
  preciosConIva: boolean
  cuadra: boolean | null
  obra: string | null
}

export type ArchivoAnalizado = { ruta: string; nombre: string; tipo: string; tamano: number } | null

export type ResultadoAnalisis = {
  encabezado: EncabezadoAnalisis
  archivo: ArchivoAnalizado
  archivoNombre: string
  renglones: RenglonAnalizado[]
  calculo: CalculoRenglon[]
  resumen: ResumenAnalisis
  dudas: string[]
  /** El mismo folio de la misma tienda ya está en el histórico. */
  yaGuardado: { id: number; version: number; fecha: string | null } | null
}

export type ResultadoGuardarAnalisis = {
  documento: number
  version: number
  partidas: number
  precios: number
  materialesNuevos: number
  equivalenciasNuevas: number
  proveedorNuevo: boolean
  alertas: { material: string; proveedor: string; antes: number; despues: number; variacionPct: number; fecha: string; folio: string }[]
}
