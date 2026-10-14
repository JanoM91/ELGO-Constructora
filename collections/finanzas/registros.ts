import type { CollectionConfig } from 'payload'
import { nadie } from '../../lib/permisos'

/**
 * Registros de Finanzas (heredados de MacAuto Finanzas, docs/60 de ese proyecto).
 *
 * LA SEPARACIÓN QUE EVITA DUPLICAR:
 *   - Operación: el compromiso con su importe total (un gasto o una entrada),
 *     con la actividad o área a la que corresponde.
 *   - Movimiento: cada cobro o pago que de verdad ocurrió, en una cuenta.
 *   - Comprobante: los archivos que la respaldan.
 *   Lo pendiente nunca se guarda: es total − movimientos (lib/finanzas/reglas.ts).
 *
 * POR QUÉ NADIE LOS TOCA DESDE LA API GENÉRICA: todas las escrituras pasan por
 * lib/finanzas/servicio.ts, que revisa permisos, valida, guarda en una sola
 * transacción y deja constancia en la bitácora. Si estas colecciones
 * aceptaran escrituras directas por /api/fin-…, alguien podría saltarse todo
 * eso. Por eso su acceso es «nadie» y están ocultas del menú; el servicio
 * entra con la API local, que no usa estas reglas.
 *
 * NADA SE BORRA: se anula o se corrige con motivo.
 */

const cerrado: CollectionConfig['access'] = { read: nadie, create: nadie, update: nadie, delete: nadie }

const TIPOS_OPERACION = [
  { label: 'Entrada', value: 'entrada' },
  { label: 'Gasto', value: 'gasto' },
  /* Dinero interno (traspasos, aportaciones y retiros) y aperturas. Las
     aperturas se declaran desde ahora para no volver a cambiar la lista
     (quitar o renombrar opciones de una base con datos es delicado). */
  { label: 'Traspaso entre cuentas', value: 'traspaso' },
  { label: 'Aportación de socio', value: 'aportacion' },
  { label: 'Retiro de socio', value: 'retiro' },
  { label: 'Por cobrar de apertura', value: 'apertura_por_cobrar' },
  { label: 'Por pagar de apertura', value: 'apertura_por_pagar' },
]

export const FinOperaciones: CollectionConfig = {
  slug: 'fin-operaciones',
  typescript: { interface: 'FinOperacion' },
  labels: { singular: 'Operación', plural: 'Operaciones' },
  admin: { hidden: true, useAsTitle: 'folio' },
  access: cerrado,
  fields: [
    { name: 'folio', type: 'text', unique: true, index: true },
    { name: 'tipo', type: 'select', required: true, options: TIPOS_OPERACION, index: true },
    { name: 'importeTotal', type: 'number', required: true },
    { name: 'fechaReal', type: 'text', required: true, index: true },
    { name: 'concepto', type: 'text', required: true },
    { name: 'categoria', type: 'relationship', relationTo: 'fin-categorias', index: true },
    { name: 'actividad', type: 'relationship', relationTo: 'fin-actividades', index: true },
    {
      name: 'asignacion',
      type: 'select',
      required: true,
      defaultValue: 'pendiente',
      options: [
        { label: 'Actividad o área', value: 'actividad' },
        { label: 'General', value: 'general' },
        { label: 'Pendiente de asignar', value: 'pendiente' },
        { label: 'No aplica', value: 'no_aplica' },
      ],
    },
    { name: 'contraparte', type: 'text' },
    { name: 'notas', type: 'textarea' },
    { name: 'venceEl', type: 'text' },
    /* Un gasto que alguien pagó de su bolsa. Queda «por
       pagar» a esa persona hasta que se le reembolsa (el reembolso es el
       movimiento de salida, con modalidad «reembolso»). */
    {
      name: 'pagadoCon',
      type: 'select',
      defaultValue: 'cuenta',
      options: [
        { label: 'Una cuenta o caja del negocio', value: 'cuenta' },
        { label: 'Dinero propio (por reembolsar)', value: 'propio' },
      ],
    },
    { name: 'reembolsoA', type: 'relationship', relationTo: 'users', index: true },
    /* Propuestas (MacAuto docs/63): quien captura no encontró la categoría o
       la obra/área y escribió una. La operación queda «sin clasificar» con su
       propuesta a la vista, se avisa a administración y, al clasificarla, la
       propuesta se borra (queda en la bitácora). */
    { name: 'categoriaPropuesta', type: 'text' },
    { name: 'actividadPropuesta', type: 'text' },
    /* MacAuto docs/68. Foto de ticket: cada concepto es una operación; las del
       mismo ticket comparten `grupoTicket` (TKT-…) y el mismo archivo.
       `porRevisar`: nació de una lectura automática (ticket) o quedó sin
       clasificar en un plan de pagos; quien la capturó puede completarla
       (concepto, importe, categoría, obra) sin el permiso de corregir, hasta
       que la marca como revisada. */
    { name: 'porRevisar', type: 'checkbox', defaultValue: false, index: true },
    { name: 'grupoTicket', type: 'text', index: true },
    /* Pagos parciales y a plazos: lo pactado (fecha e importe de cada pago).
       Lo cobrado o pagado de verdad sigue siendo la suma de los movimientos;
       el estado de cada pago se calcula (estadoCalendario). */
    {
      name: 'calendario',
      type: 'array',
      fields: [
        { name: 'fecha', type: 'text' },
        { name: 'importe', type: 'number', required: true },
        { name: 'nota', type: 'text' },
      ],
    },
    { name: 'capturadoPor', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'origen',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'Captura manual', value: 'manual' },
        { label: 'Nota de voz', value: 'voz' },
        { label: 'Importación', value: 'importacion' },
        { label: 'Arranque', value: 'apertura' },
      ],
    },
    { name: 'anulada', type: 'checkbox', defaultValue: false, index: true },
    { name: 'motivoAnulacion', type: 'text' },
    { name: 'anuladaPor', type: 'relationship', relationTo: 'users' },
    { name: 'anuladaEn', type: 'date' },
    /* Un guardado repetido (se cortó la señal, doble toque) trae la misma
       clave: la base no admite dos iguales, así que no se duplica. */
    { name: 'claveIdempotencia', type: 'text', unique: true, index: true },
  ],
}

export const FinMovimientos: CollectionConfig = {
  slug: 'fin-movimientos',
  typescript: { interface: 'FinMovimiento' },
  labels: { singular: 'Movimiento', plural: 'Movimientos' },
  admin: { hidden: true },
  access: cerrado,
  fields: [
    { name: 'operacion', type: 'relationship', relationTo: 'fin-operaciones', required: true, index: true },
    { name: 'cuenta', type: 'relationship', relationTo: 'fin-cuentas', required: true, index: true },
    {
      name: 'direccion',
      type: 'select',
      required: true,
      options: [
        { label: 'Entra', value: 'entra' },
        { label: 'Sale', value: 'sale' },
      ],
    },
    { name: 'importe', type: 'number', required: true },
    { name: 'fechaReal', type: 'text', required: true, index: true },
    {
      name: 'medio',
      type: 'select',
      required: true,
      options: [
        { label: 'Efectivo', value: 'efectivo' },
        { label: 'Transferencia', value: 'transferencia' },
        { label: 'Tarjeta', value: 'tarjeta' },
        { label: 'Cheque', value: 'cheque' },
        { label: 'Depósito', value: 'deposito' },
      ],
    },
    {
      name: 'modalidad',
      type: 'select',
      defaultValue: 'contado',
      options: [
        { label: 'Contado', value: 'contado' },
        { label: 'Anticipo', value: 'anticipo' },
        { label: 'Parcialidad', value: 'parcialidad' },
        { label: 'Liquidación', value: 'liquidacion' },
        { label: 'Financiamiento', value: 'financiamiento' },
        { label: 'Reembolso', value: 'reembolso' },
        { label: 'Traspaso', value: 'traspaso' },
      ],
    },
    { name: 'capturadoPor', type: 'relationship', relationTo: 'users', required: true },
    { name: 'anulado', type: 'checkbox', defaultValue: false },
    { name: 'claveIdempotencia', type: 'text', unique: true, index: true },
  ],
}

export const FinComprobantes: CollectionConfig = {
  slug: 'fin-comprobantes',
  typescript: { interface: 'FinComprobante' },
  labels: { singular: 'Comprobante', plural: 'Comprobantes' },
  admin: { hidden: true },
  access: cerrado,
  fields: [
    { name: 'operacion', type: 'relationship', relationTo: 'fin-operaciones', required: true, index: true },
    /* Ruta del archivo en el almacén PRIVADO de Vercel Blob. No es una liga
       pública: el archivo solo se entrega por /api/finanzas/comprobantes/…,
       que revisa permisos antes de cada descarga. */
    { name: 'ruta', type: 'text', required: true },
    { name: 'nombreArchivo', type: 'text', required: true },
    { name: 'tipoContenido', type: 'text' },
    { name: 'tamano', type: 'number' },
    { name: 'subidoPor', type: 'relationship', relationTo: 'users', required: true },
    { name: 'revisadoPor', type: 'relationship', relationTo: 'users' },
    { name: 'revisadoEn', type: 'date' },
    { name: 'claveIdempotencia', type: 'text', unique: true, index: true },
  ],
}

export const FinBitacora: CollectionConfig = {
  slug: 'fin-bitacora',
  typescript: { interface: 'FinBitacora' },
  labels: { singular: 'Registro de bitácora', plural: 'Bitácora' },
  admin: { hidden: true },
  access: cerrado,
  fields: [
    { name: 'operacion', type: 'relationship', relationTo: 'fin-operaciones', index: true },
    {
      name: 'accion',
      type: 'select',
      required: true,
      options: [
        { label: 'Creó', value: 'crear' },
        { label: 'Corrigió', value: 'corregir' },
        { label: 'Clasificó', value: 'clasificar' },
        { label: 'Anuló', value: 'anular' },
        { label: 'Registró cobro', value: 'cobro' },
        { label: 'Registró pago', value: 'pago' },
        { label: 'Subió comprobante', value: 'comprobante' },
        { label: 'Revisó comprobante', value: 'revision' },
      ],
    },
    { name: 'campo', type: 'text' },
    { name: 'valorAnterior', type: 'text' },
    { name: 'valorNuevo', type: 'text' },
    { name: 'motivo', type: 'text' },
    { name: 'usuario', type: 'relationship', relationTo: 'users', required: true },
  ],
}
