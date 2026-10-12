/**
 * Lo que viaja entre el servidor y las pantallas de Finanzas.
 *
 * Todos los importes viajan en CENTAVOS ENTEROS (`...Centavos`). La pantalla
 * solo los formatea; nunca suma pesos con decimales.
 */

export type Ref = { id: number; nombre: string }

export type PermisosVista = {
  superadmin: boolean
  panel: boolean
  gestionarUsuarios: boolean
  registrar: boolean
  ver: 'propios' | 'alcance' | 'todos'
  verRestringidas: boolean
  verSaldos: boolean
  verUtilidad: boolean
  liquidar: boolean
  corregir: boolean
  revisarComprobantes: boolean
  configurar: boolean
  moverDinero: boolean
  rolNombre: string
  alcanceTexto: string
}

/** `responsable` solo viene en cuentas de tipo «fondo» (dinero a cargo de una persona, docs/62). */
export type CuentaVista = { id: number; nombre: string; tipo: string; activa: boolean; responsable: Ref | null }
export type CategoriaVista = { id: number; nombre: string; tipo: 'entrada' | 'gasto'; restringida: boolean; actividadSugerida: number | null }

/** Una «bolsa» a la que se asigna dinero: una obra o un área de soporte (colección `fin-actividades`). */
export type ObraRef = Ref & { tipo: 'obra' | 'area' }

export type Catalogo = {
  hoy: string
  fechaCorte: string | null
  cuentas: CuentaVista[]
  categorias: CategoriaVista[]
  /** Obras activas y áreas de soporte (el nombre técnico «actividades» se hereda de MacAuto). */
  actividades: ObraRef[]
  frecuentes: { cuentas: number[]; categorias: number[] }
  usuario: { id: number; nombre: string }
  permisos: PermisosVista
}

export type EstadoEvidencia = 'pendiente' | 'por_revisar' | 'revisada'

export type OperacionVista = {
  id: number
  folio: string
  tipo: string
  totalCentavos: number
  fechaReal: string
  concepto: string
  categoria: (Ref & { restringida: boolean }) | null
  actividad: Ref | null
  asignacion: string
  contraparte: string
  notas: string
  venceEl: string | null
  capturadoPor: Ref
  capturadoEn: string
  origen: string
  anulada: boolean
  motivoAnulacion: string
  pagadoCentavos: number
  pendienteCentavos: number
  estadoPago: 'liquidado' | 'parcial' | 'pendiente' | 'anulado'
  clasificacion: 'ok' | 'pendiente'
  evidencia: EstadoEvidencia
  cuentas: string[]
  /** Gasto pagado de la bolsa de alguien: `propio` hasta que se le reembolsa (docs/62). */
  pagadoCon: 'cuenta' | 'propio'
  reembolsoA: Ref | null
  /** Solo en traspasos: de qué cuenta salió y a cuál entró. */
  traspaso: { de: string; a: string } | null
}

export type MovimientoVista = {
  id: number
  cuenta: Ref
  direccion: 'entra' | 'sale'
  centavos: number
  fechaReal: string
  medio: string
  modalidad: string
  capturadoPor: Ref
  capturadoEn: string
  anulado: boolean
}

export type ComprobanteVista = {
  id: number
  nombre: string
  tipoContenido: string
  subidoPor: Ref
  subidoEn: string
  revisadoPor: Ref | null
  revisadoEn: string | null
}

export type BitacoraVista = { id: number; accion: string; campo: string; anterior: string; nuevo: string; motivo: string; usuario: Ref; fecha: string }

export type DetalleOperacion = {
  operacion: OperacionVista
  movimientos: MovimientoVista[]
  comprobantes: ComprobanteVista[]
  bitacora: BitacoraVista[]
  acciones: { liquidar: boolean; adjuntar: boolean; revisar: boolean; corregir: boolean }
}

export type ListaOperaciones = {
  filas: OperacionVista[]
  totales: { entradasCentavos: number; gastosCentavos: number }
  rango: { desde: string; hasta: string }
  alcance: string
  truncado: boolean
}

export type Pendientes = {
  sinComprobante: OperacionVista[]
  porRevisar: OperacionVista[]
  sinClasificar: OperacionVista[]
  porCobrarOPagar: OperacionVista[]
  /** Gastos que alguien pagó de su bolsa y todavía no se le devuelven (docs/62). */
  porReembolsar: OperacionVista[]
}

export type Saldos = { cuentas: { cuenta: CuentaVista; saldoInicialCentavos: number; saldoCentavos: number }[]; totalActivasCentavos: number }

export type Resumen = {
  conteos: { sinComprobante: number; porRevisar: number; sinClasificar: number; porCobrarOPagar: number; porReembolsar: number }
  ultimos: OperacionVista[]
  saldoTotalCentavos: number | null
  configurado: { roles: boolean; catalogos: boolean; cuentas: boolean; fechaCorte: boolean }
  /** Lo que el negocio le debe a quien consulta por gastos pagados de su bolsa. */
  teDebenCentavos: number
  /** Total por reembolsar a todo el equipo; solo para quien registra cobros y pagos de cualquier pendiente. */
  porReembolsarCentavos: number | null
  /** El fondo a cargo de quien consulta (si tiene uno) y cuánto dinero tiene en su poder. */
  miFondo: { cuenta: CuentaVista; saldoCentavos: number } | null
  /** Dinero en manos del equipo (suma de los fondos activos); solo para quien ve saldos o mueve dinero. */
  fondosEnManosCentavos: number | null
}

/* ───────── ELGO: resultado por obra ───────── */

/**
 * Una fila de la pantalla «Obras». Base devengada: una entrada o un gasto
 * cuenta desde que se registra, aunque siga por cobrar o por pagar; lo cobrado
 * y lo pagado van aparte para ver el flujo. Traspasos, aportaciones y retiros
 * no cuentan. Los anulados tampoco.
 */
export type FilaObra = {
  /** `id` null en las filas «General» y «Sin asignar». */
  id: number | null
  nombre: string
  tipo: 'obra' | 'area' | 'general' | 'pendiente'
  clave: string
  cliente: string
  sector: 'publico' | 'privado' | null
  activa: boolean
  contratadoCentavos: number | null
  entradasCentavos: number
  cobradoCentavos: number
  porCobrarCentavos: number
  gastosCentavos: number
  pagadoCentavos: number
  /** Incluye gastos pagados de la bolsa de alguien que siguen por reembolsar. */
  porPagarCentavos: number
  /** Entradas − gastos (devengado). */
  resultadoCentavos: number
  /** Cobrado − pagado (lo que de verdad ha entrado y salido). */
  flujoCentavos: number
  operaciones: number
  ultimo: string | null
}

export type TotalesObras = Omit<FilaObra, 'id' | 'nombre' | 'tipo' | 'clave' | 'cliente' | 'sector' | 'activa' | 'ultimo'>

export type ResultadoObras = {
  filas: FilaObra[]
  totales: TotalesObras
  rango: { desde: string | null; hasta: string }
  /** Sin la casilla de restringidas, la nómina administrativa no entra: el resultado de Oficina sale incompleto. */
  incluyeRestringidas: boolean
}

/* ───────── etapa 3: dinero interno (docs/62) ───────── */

export type TipoMovimientoInterno = 'traspaso' | 'aportacion' | 'retiro'

/** Lo que manda la pantalla «Mover dinero». */
export type EntradaMover = {
  tipo: TipoMovimientoInterno
  importe: string
  fechaReal: string
  /** Traspaso: de → a. Aportación: solo `a`. Retiro: solo `de`. */
  de?: number | null
  a?: number | null
  medio?: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'deposito' | null
  concepto: string
  /** Nombre del socio en aportaciones y retiros. */
  contraparte?: string | null
  notas?: string | null
}

export type FondoVista = {
  cuenta: CuentaVista
  /** Dinero que la persona tiene en su poder ahora mismo. */
  saldoCentavos: number
  /** Desde la fecha de inicio de la cuenta: lo que se le ha entregado, lo que comprobó con gastos y lo que devolvió. */
  entregadoCentavos: number
  comprobadoCentavos: number
  devueltoCentavos: number
  ultimoMovimiento: string | null
}

export type Fondos = { fondos: FondoVista[]; totalEnManosCentavos: number }

export type PersonaBreve = { id: number; nombre: string }

/* ───────── etapa 4: nota de voz (docs/62) ───────── */

/** El borrador que arma la nota de voz. Nunca se guarda solo: llena el formulario y la persona confirma. */
export type BorradorVoz = {
  tipo: 'entrada' | 'gasto'
  importe: string
  estado: 'realizado' | 'pendiente' | 'propio'
  cuenta: number | null
  medio: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | null
  concepto: string
  categoria: number | null
  asig: 'actividad' | 'general' | 'pendiente' | null
  actividad: number | null
  fechaReal: string
  contraparte: string
  notas: string
}

export type ResultadoVoz = {
  transcripcion: string
  borrador: BorradorVoz
  /** Lo que la nota no dejó claro, en palabras de la persona. */
  dudas: string[]
}

/** Cuentas del panel con sus sesiones abiertas (Configuración → si se pierde un teléfono, docs/61). */
export type PersonaConSesiones = { id: number; nombre: string; email: string; sesiones: number; esSuperadmin: boolean }
