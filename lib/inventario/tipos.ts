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
