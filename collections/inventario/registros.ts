import type { CollectionConfig } from 'payload'
import { nadie } from '../../lib/permisos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Registros de Inventario (ELGO Inventario, fase A — octubre de 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LA SEPARACIÓN QUE EVITA DUPLICAR Y PERDER HISTORIA:
 *   - Documento: lo que entra (cotización de una tienda, requisición de una
 *     obra, factura, presupuesto del cliente, referencia web), con su archivo.
 *   - Partida: cada línea de ese documento, tal como venía, más el material
 *     con el que se empató y la cantidad y el precio normalizados a la unidad
 *     base y sin IVA.
 *   - Precio: el histórico limpio. Solo se escribe cuando un documento pasa a
 *     CONFIRMADO. Es la tabla que alimenta comparación y pronóstico.
 *   - Movimiento: cada entrada, salida, traspaso o ajuste de material. Las
 *     existencias nunca se guardan: son la suma de movimientos
 *     (lib/inventario/reglas.ts).
 *   - Bitácora: quién hizo qué.
 *
 * POR QUÉ NADIE LOS TOCA DESDE LA API GENÉRICA: todas las escrituras pasan por
 * lib/inventario/servicio.ts, que revisa permisos, valida, guarda en una sola
 * transacción y deja constancia. Igual que las colecciones `fin-*`, su acceso
 * es «nadie» y están ocultas del menú; el servicio entra con la API local.
 *
 * NADA SE BORRA: se anula con motivo.
 */

const cerrado: CollectionConfig['access'] = { read: nadie, create: nadie, update: nadie, delete: nadie }

export const TIPOS_DOCUMENTO = [
  { label: 'Cotización de proveedor', value: 'cotizacion' },
  { label: 'Requisición de obra', value: 'requisicion' },
  { label: 'Factura', value: 'factura' },
  { label: 'Presupuesto oficial del cliente', value: 'presupuesto' },
  { label: 'Referencia web', value: 'referencia_web' },
] as const

export const ESTADOS_DOCUMENTO = [
  { label: 'Por revisar', value: 'por_revisar' },
  { label: 'Confirmado', value: 'confirmado' },
  { label: 'Anulado', value: 'anulado' },
] as const

/* Solo para requisiciones: dónde va la compra. */
export const ESTADOS_REQUISICION = [
  { label: 'Borrador', value: 'borrador' },
  { label: 'Enviada a cotizar', value: 'enviada' },
  { label: 'Cotizada', value: 'cotizada' },
  { label: 'Aprobada', value: 'aprobada' },
  { label: 'Comprada', value: 'comprada' },
  { label: 'Cerrada', value: 'cerrada' },
] as const

export const InvDocumentos: CollectionConfig = {
  slug: 'inv-documentos',
  typescript: { interface: 'InvDocumento' },
  labels: { singular: 'Documento', plural: 'Documentos' },
  admin: { hidden: true, useAsTitle: 'folio' },
  access: cerrado,
  fields: [
    { name: 'tipo', type: 'select', required: true, options: [...TIPOS_DOCUMENTO], index: true },
    { name: 'estado', type: 'select', required: true, defaultValue: 'por_revisar', options: [...ESTADOS_DOCUMENTO], index: true },
    { name: 'proveedor', type: 'relationship', relationTo: 'inv-proveedores', index: true },
    { name: 'obra', type: 'relationship', relationTo: 'fin-actividades', index: true },
    /* Folio del proveedor (CO-12882, XF 42195) o el nuestro en requisiciones (REQ-000012). */
    { name: 'folio', type: 'text', index: true },
    { name: 'titulo', type: 'text' },
    { name: 'fechaDocumento', type: 'text', index: true },
    { name: 'vigenciaHasta', type: 'text' },
    /* Un folio puede llegar varias veces corregido: se guardan todas; la última confirmada manda. */
    { name: 'version', type: 'number', required: true, defaultValue: 1 },
    { name: 'documentoPadre', type: 'relationship', relationTo: 'inv-documentos', index: true },
    /* Archivo en el almacén PRIVADO de Vercel Blob (carpeta inventario/). Solo se entrega por la API del servicio. */
    { name: 'archivoRuta', type: 'text' },
    { name: 'archivoNombre', type: 'text' },
    { name: 'archivoTipo', type: 'text' },
    { name: 'archivoTamano', type: 'number' },
    /* Totales tal como vienen en el documento, en pesos. */
    { name: 'subtotal', type: 'number' },
    { name: 'iva', type: 'number' },
    { name: 'total', type: 'number' },
    { name: 'cuadra', type: 'checkbox', defaultValue: true },
    /* Requisiciones. */
    { name: 'estadoRequisicion', type: 'select', options: [...ESTADOS_REQUISICION], index: true },
    { name: 'prioridad', type: 'select', options: [{ label: 'Planeada', value: 'planeada' }, { label: 'Urgente', value: 'urgente' }] },
    { name: 'necesariaPara', type: 'text' },
    { name: 'solicitante', type: 'relationship', relationTo: 'users' },
    /* Lectura automática. */
    { name: 'origen', type: 'select', defaultValue: 'manual', options: [{ label: 'Captura manual', value: 'manual' }, { label: 'Lectura automática', value: 'lectura' }, { label: 'Importación', value: 'importacion' }] },
    { name: 'lecturaNotas', type: 'textarea' },
    { name: 'subidoPor', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'confirmadoPor', type: 'relationship', relationTo: 'users' },
    { name: 'confirmadoEn', type: 'date' },
    { name: 'anuladoPor', type: 'relationship', relationTo: 'users' },
    { name: 'anuladoEn', type: 'date' },
    { name: 'motivoAnulacion', type: 'text' },
    { name: 'notas', type: 'textarea' },
    { name: 'claveIdempotencia', type: 'text', unique: true, index: true },
  ],
}

export const METODOS_EMPATE = [
  { label: 'Marca y número de parte', value: 'numero_parte' },
  { label: 'Clave del proveedor', value: 'clave_proveedor' },
  { label: 'Equivalencia previa', value: 'equivalencia' },
  { label: 'Descripción (automático)', value: 'descripcion' },
  { label: 'Manual', value: 'manual' },
] as const

export const ESTADOS_EMPATE = [
  { label: 'Propuesto', value: 'propuesto' },
  { label: 'Confirmado', value: 'confirmado' },
  { label: 'Sin material', value: 'sin_material' },
  { label: 'Descartada', value: 'descartada' },
] as const

export const InvPartidas: CollectionConfig = {
  slug: 'inv-partidas',
  typescript: { interface: 'InvPartida' },
  labels: { singular: 'Partida', plural: 'Partidas' },
  admin: { hidden: true },
  access: cerrado,
  fields: [
    { name: 'documento', type: 'relationship', relationTo: 'inv-documentos', required: true, index: true },
    { name: 'linea', type: 'number', required: true },
    { name: 'grupo', type: 'text' },
    /* Tal como venía. */
    { name: 'textoOriginal', type: 'text', required: true },
    { name: 'cantidadOriginal', type: 'number' },
    { name: 'unidadOriginal', type: 'text' },
    { name: 'precioUnitarioOriginal', type: 'number' },
    { name: 'importeOriginal', type: 'number' },
    { name: 'marcaOriginal', type: 'text' },
    { name: 'claveProveedor', type: 'text', index: true },
    { name: 'incluyeIva', type: 'checkbox', defaultValue: false },
    /* Empate. */
    { name: 'material', type: 'relationship', relationTo: 'inv-materiales', index: true },
    { name: 'metodoEmpate', type: 'select', options: [...METODOS_EMPATE] },
    { name: 'confianzaEmpate', type: 'number' },
    { name: 'estadoEmpate', type: 'select', required: true, defaultValue: 'propuesto', options: [...ESTADOS_EMPATE], index: true },
    { name: 'materialPropuesto', type: 'relationship', relationTo: 'inv-materiales' },
    /* Normalizado a unidad base, sin IVA, en pesos. */
    { name: 'factor', type: 'number', defaultValue: 1 },
    { name: 'cantidadBase', type: 'number' },
    { name: 'precioUnitarioBase', type: 'number' },
    { name: 'importeBase', type: 'number' },
    /* Requisiciones: lo que el pronóstico decidió para esta partida (fase D). */
    { name: 'precioPronosticado', type: 'number' },
    { name: 'fuentePronostico', type: 'text' },
    /* Diferencias contra la requisición, alertas de precio. */
    { name: 'observaciones', type: 'array', fields: [{ name: 'tipo', type: 'text', required: true }, { name: 'texto', type: 'text', required: true }] },
    { name: 'variacionPct', type: 'number' },
    { name: 'alertaPrecio', type: 'checkbox', defaultValue: false, index: true },
    { name: 'revisadaPor', type: 'relationship', relationTo: 'users' },
  ],
}

export const InvPrecios: CollectionConfig = {
  slug: 'inv-precios',
  typescript: { interface: 'InvPrecio' },
  labels: { singular: 'Precio', plural: 'Precios' },
  admin: { hidden: true },
  access: cerrado,
  fields: [
    { name: 'material', type: 'relationship', relationTo: 'inv-materiales', required: true, index: true },
    { name: 'proveedor', type: 'relationship', relationTo: 'inv-proveedores', required: true, index: true },
    { name: 'fecha', type: 'text', required: true, index: true },
    { name: 'vigenciaHasta', type: 'text' },
    /* Sin IVA, por unidad base, en pesos. */
    { name: 'precioBase', type: 'number', required: true },
    { name: 'unidadBase', type: 'text', required: true },
    { name: 'fuente', type: 'select', required: true, options: [{ label: 'Cotización', value: 'cotizacion' }, { label: 'Factura', value: 'factura' }, { label: 'Referencia web', value: 'web' }, { label: 'Captura manual', value: 'manual' }] },
    { name: 'documento', type: 'relationship', relationTo: 'inv-documentos', index: true },
    { name: 'partida', type: 'relationship', relationTo: 'inv-partidas' },
    { name: 'url', type: 'text' },
    { name: 'anulado', type: 'checkbox', defaultValue: false, index: true },
  ],
}

export const TIPOS_MOVIMIENTO = [
  { label: 'Entrada por compra', value: 'entrada_compra' },
  { label: 'Salida a obra', value: 'salida_obra' },
  { label: 'Traspaso entre ubicaciones', value: 'traspaso' },
  { label: 'Devolución', value: 'devolucion' },
  { label: 'Ajuste por conteo', value: 'ajuste' },
  { label: 'Merma', value: 'merma' },
  { label: 'Existencia inicial', value: 'apertura' },
] as const

export const InvMovimientos: CollectionConfig = {
  slug: 'inv-movimientos',
  typescript: { interface: 'InvMovimiento' },
  labels: { singular: 'Movimiento', plural: 'Movimientos' },
  admin: { hidden: true },
  access: cerrado,
  fields: [
    { name: 'tipo', type: 'select', required: true, options: [...TIPOS_MOVIMIENTO], index: true },
    { name: 'material', type: 'relationship', relationTo: 'inv-materiales', required: true, index: true },
    /* En unidad base. Positiva siempre: la dirección la dan origen y destino. */
    { name: 'cantidad', type: 'number', required: true },
    { name: 'origen', type: 'relationship', relationTo: 'inv-ubicaciones', index: true },
    { name: 'destino', type: 'relationship', relationTo: 'inv-ubicaciones', index: true },
    { name: 'obra', type: 'relationship', relationTo: 'fin-actividades', index: true },
    { name: 'fecha', type: 'text', required: true, index: true },
    { name: 'documento', type: 'relationship', relationTo: 'inv-documentos', index: true },
    { name: 'partida', type: 'relationship', relationTo: 'inv-partidas' },
    { name: 'costoUnitarioBase', type: 'number' },
    { name: 'fotoRuta', type: 'text' },
    { name: 'motivo', type: 'text' },
    { name: 'registradoPor', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'anulado', type: 'checkbox', defaultValue: false, index: true },
    { name: 'motivoAnulacion', type: 'text' },
    { name: 'claveIdempotencia', type: 'text', unique: true, index: true },
  ],
}

export const InvBitacora: CollectionConfig = {
  slug: 'inv-bitacora',
  typescript: { interface: 'InvBitacora' },
  labels: { singular: 'Registro de bitácora', plural: 'Bitácora de Inventario' },
  admin: { hidden: true },
  access: cerrado,
  fields: [
    { name: 'coleccion', type: 'text', required: true, index: true },
    { name: 'registro', type: 'number', index: true },
    { name: 'documento', type: 'relationship', relationTo: 'inv-documentos', index: true },
    {
      name: 'accion',
      type: 'select',
      required: true,
      options: [
        { label: 'Creó', value: 'crear' },
        { label: 'Subió documento', value: 'subir' },
        { label: 'Empató partida', value: 'empatar' },
        { label: 'Confirmó', value: 'confirmar' },
        { label: 'Anuló', value: 'anular' },
        { label: 'Registró movimiento', value: 'movimiento' },
        { label: 'Corrigió', value: 'corregir' },
        { label: 'Arranque', value: 'arranque' },
      ],
    },
    { name: 'campo', type: 'text' },
    { name: 'valorAnterior', type: 'text' },
    { name: 'valorNuevo', type: 'text' },
    { name: 'motivo', type: 'text' },
    { name: 'usuario', type: 'relationship', relationTo: 'users', required: true },
  ],
}
