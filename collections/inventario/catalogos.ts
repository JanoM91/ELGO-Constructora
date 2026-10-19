import type { CollectionConfig, GlobalConfig } from 'payload'
import { configuraInventario, editaCatalogoInventario, nadie, usaInventarioOPanel } from '../../lib/permisos'
import { tieneDosDecimalesOMenos } from '../../lib/finanzas/reglas'
import { UNIDADES_BASE, textoDeBusqueda } from '../../lib/inventario/reglas'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Catálogos de Inventario (ELGO Inventario, fase A — octubre de 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Son las tablas «maestras» del módulo de compras y existencias:
 *
 *   - Proveedores: las tiendas y distribuidores a los que ELGO pide precio.
 *   - Familias: cómo se agrupan los materiales (tableros, cable, tubería…).
 *   - Materiales: el catálogo canónico. Crece solo con el uso: cada partida de
 *     una cotización, requisición o factura termina empatada con un material.
 *   - Equivalencias: la memoria del empate. «Como lo llama cada tienda» →
 *     material nuestro, con el factor para pasar de la unidad de la tienda
 *     (tramo, kg) a nuestra unidad base (metro, pieza).
 *   - Ubicaciones: dónde puede haber material (bodega, cada obra, un vehículo).
 *
 * Se editan con las pantallas de siempre del panel (grupo «Inventario»), por
 * quien tenga la casilla correspondiente en su rol. No se borran: se
 * desactivan, para que los registros que ya los usan conserven su historia.
 * Lo que cambia de forma automática (último precio, fecha del último
 * movimiento) lo escribe lib/inventario/servicio.ts, nunca una persona.
 */

const validarPesos = (v: unknown) => {
  if (v == null || v === '') return true
  return typeof v === 'number' && v >= 0 && tieneDosDecimalesOMenos(v) ? true : 'Usa un importe positivo con a lo más dos decimales.'
}

const accesoCatalogo: CollectionConfig['access'] = {
  read: usaInventarioOPanel,
  create: configuraInventario,
  update: configuraInventario,
  delete: nadie,
}

export const InvProveedores: CollectionConfig = {
  slug: 'inv-proveedores',
  typescript: { interface: 'InvProveedor' },
  labels: { singular: 'Proveedor', plural: 'Proveedores' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Inventario',
    defaultColumns: ['nombre', 'tipo', 'prioridad', 'ciudad', 'activo'],
    description:
      'A quién le pide precio ELGO: tiendas de Xalapa, distribuidores y fabricantes. «Referencia web» es un proveedor virtual para los precios de internet. Desactivar no borra la historia.',
  },
  access: accesoCatalogo,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true, admin: { description: 'Como aparece en sus cotizaciones. Ej. «Eléctrico S.A. de C.V.»' } },
        { name: 'nombreCorto', label: 'Nombre corto', type: 'text', required: true, admin: { description: 'Para el celular y el cuadro comparativo. Ej. «Eléctrico», «M&M».' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'tipo',
          label: 'Tipo',
          type: 'select',
          required: true,
          defaultValue: 'tienda',
          options: [
            { label: 'Tienda local', value: 'tienda' },
            { label: 'Distribuidor', value: 'distribuidor' },
            { label: 'Fabricante', value: 'fabricante' },
            { label: 'Referencia web (precios de internet)', value: 'web' },
          ],
        },
        {
          name: 'prioridad',
          label: 'Prioridad',
          type: 'select',
          required: true,
          defaultValue: 'primera',
          options: [
            { label: 'Primera opción', value: 'primera' },
            { label: 'Segunda opción', value: 'segunda' },
            { label: 'Fuera de Xalapa (solo equipos que aquí no hay)', value: 'foraneo' },
            { label: 'Solo referencia', value: 'referencia' },
          ],
        },
        { name: 'ciudad', label: 'Ciudad', type: 'text', defaultValue: 'Xalapa' },
      ],
    },
    { name: 'claveCliente', label: 'Clave de cliente de ELGO con este proveedor', type: 'text', admin: { description: 'La que aparece en sus cotizaciones o facturas. Opcional.' } },
    {
      name: 'contactos',
      label: 'Contactos',
      type: 'array',
      labels: { singular: 'Contacto', plural: 'Contactos' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'nombre', label: 'Nombre', type: 'text', required: true },
            { name: 'whatsapp', label: 'WhatsApp', type: 'text' },
            { name: 'correo', label: 'Correo', type: 'email' },
          ],
        },
      ],
    },
    {
      name: 'condiciones',
      label: 'Condiciones',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'vigenciaDias', label: 'Vigencia típica de su cotización (días)', type: 'number', min: 0, defaultValue: 15 },
            { name: 'descuentoSobreLista', label: 'Descuento sobre lista (%)', type: 'number', min: 0, max: 100, admin: { description: 'Solo si lo tienen acordado. Vacío = no se sabe.' } },
          ],
        },
        { name: 'manejaSaldoAFavor', label: 'Maneja saldo a favor (anticipos)', type: 'checkbox', defaultValue: false },
      ],
    },
    { name: 'sitioWeb', label: 'Sitio web', type: 'text' },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
}

export const InvFamilias: CollectionConfig = {
  slug: 'inv-familias',
  typescript: { interface: 'InvFamilia' },
  labels: { singular: 'Familia de materiales', plural: 'Familias de materiales' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Inventario',
    defaultColumns: ['nombre', 'padre', 'orden', 'activa'],
    description: 'Cómo se agrupan los materiales, en dos niveles: una familia (p. ej. «Canalización») y sus subfamilias (p. ej. «Tubo conduit»). Sirve para buscar y para acotar el empate automático.',
  },
  access: accesoCatalogo,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true },
        { name: 'padre', label: 'Familia a la que pertenece', type: 'relationship', relationTo: 'inv-familias', admin: { description: 'Vacío = es una familia de primer nivel.' } },
        { name: 'orden', label: 'Orden', type: 'number', defaultValue: 0 },
      ],
    },
    { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
  ],
}

export const InvMateriales: CollectionConfig = {
  slug: 'inv-materiales',
  typescript: { interface: 'InvMaterial' },
  labels: { singular: 'Material', plural: 'Materiales' },
  admin: {
    useAsTitle: 'descripcion',
    group: 'Inventario',
    defaultColumns: ['clave', 'descripcion', 'familia', 'marca', 'numeroParte', 'unidadBase', 'activo'],
    listSearchableFields: ['clave', 'descripcion', 'marca', 'numeroParte', 'textoBusqueda'],
    description:
      'El catálogo canónico: una fila por material tal como lo nombra ELGO. Cada cotización o requisición que entra se empata con estas filas (o crea una nueva). Los precios conocidos los actualiza el sistema al confirmar documentos.',
  },
  access: { ...accesoCatalogo, create: editaCatalogoInventario, update: editaCatalogoInventario },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data) return data
        data.textoBusqueda = textoDeBusqueda([
          data.descripcion, data.marca, data.numeroParte,
          data.atributos?.medida, data.atributos?.calibre, data.atributos?.color, data.atributos?.pared,
          data.atributos?.amperes ? `${data.atributos.amperes} amp` : null,
        ])
        return data
      },
    ],
    afterChange: [
      /* Clave interna: MAT-000123 con el id. Se asigna una sola vez al crear. */
      async ({ doc, operation, req }) => {
        if (operation === 'create' && !doc.clave) {
          const clave = `MAT-${String(doc.id).padStart(6, '0')}`
          await req.payload.update({ collection: 'inv-materiales', id: doc.id, data: { clave }, overrideAccess: true, req, depth: 0 })
          return { ...doc, clave }
        }
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'clave', label: 'Clave', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'La asigna el sistema (MAT-000001).' } },
        { name: 'familia', label: 'Familia', type: 'relationship', relationTo: 'inv-familias', index: true },
      ],
    },
    { name: 'descripcion', label: 'Descripción', type: 'text', required: true, admin: { description: 'Corta y en el vocabulario de ELGO. Ej. «Tubo conduit galvanizado pared gruesa 2"» o «Interruptor LAL36350 3P 350 A».' } },
    {
      type: 'row',
      fields: [
        { name: 'marca', label: 'Marca', type: 'text', index: true },
        { name: 'numeroParte', label: 'Número de parte del fabricante', type: 'text', index: true, admin: { description: 'Ej. «LAL36350», «NQ442L4C». Con marca + número de parte el empate es exacto.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'unidadBase',
          label: 'Unidad base',
          type: 'select',
          required: true,
          defaultValue: 'pieza',
          options: UNIDADES_BASE.map((u) => ({ label: u.label, value: u.value })),
          admin: { description: 'En qué unidad se guardan precios y existencias. Si una tienda cotiza en otra (tramo, kg), se convierte con un factor.' },
        },
        { name: 'critico', label: 'Crítico (validación técnica)', type: 'checkbox', defaultValue: false, admin: { description: 'Tableros, interruptores y lo que un ingeniero debe revisar antes de comprar.' } },
      ],
    },
    {
      name: 'atributos',
      label: 'Atributos',
      type: 'group',
      admin: { description: 'Solo los que apliquen. Ayudan a distinguir variantes y a empatar descripciones.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'medida', label: 'Medida', type: 'text', admin: { description: 'Ej. 2", 1 1/4", 3/8' } },
            { name: 'calibre', label: 'Calibre', type: 'text', admin: { description: 'Ej. 12, 10, 1/0' } },
            { name: 'color', label: 'Color', type: 'text' },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'pared',
              label: 'Pared',
              type: 'select',
              options: [
                { label: 'Gruesa (PG)', value: 'pg' },
                { label: 'Delgada (PD)', value: 'pd' },
                { label: 'No aplica', value: 'na' },
              ],
            },
            { name: 'longitudTramo', label: 'Longitud por tramo (m)', type: 'number', min: 0, admin: { description: 'Para tubería: 3.05 m por tramo es lo usual.' } },
            { name: 'pesoPorMetroKg', label: 'Peso por metro (kg)', type: 'number', min: 0, admin: { description: 'Para cable que las tiendas cotizan por kilo.' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'amperes', label: 'Amperes', type: 'number', min: 0 },
            { name: 'polos', label: 'Polos', type: 'number', min: 0 },
            { name: 'tension', label: 'Tensión', type: 'text', admin: { description: 'Ej. 600 V, 240 V' } },
            { name: 'acabado', label: 'Material o acabado', type: 'text', admin: { description: 'Ej. galvanizado, PVC, cobre' } },
          ],
        },
      ],
    },
    /* Lo escribe el servicio al confirmar documentos y movimientos. */
    {
      name: 'ultimoPrecio',
      label: 'Último precio conocido',
      type: 'group',
      admin: { readOnly: true, description: 'Lo actualiza el sistema al confirmar una cotización o factura. Sin IVA, por unidad base.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'precioBase', label: 'Precio sin IVA (MXN)', type: 'number', validate: validarPesos },
            { name: 'proveedor', label: 'Proveedor', type: 'relationship', relationTo: 'inv-proveedores' },
            { name: 'fecha', label: 'Fecha', type: 'text' },
          ],
        },
      ],
    },
    { name: 'precioReferencia', label: 'Precio de referencia sin IVA (MXN)', type: 'number', validate: validarPesos, admin: { readOnly: true, description: 'El mejor precio vigente entre proveedores. Lo calcula el sistema.' } },
    { name: 'fechaUltimoMovimiento', label: 'Último movimiento de existencias', type: 'text', admin: { readOnly: true } },
    { name: 'textoBusqueda', type: 'text', index: true, admin: { hidden: true } },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
}

export const InvEquivalencias: CollectionConfig = {
  slug: 'inv-equivalencias',
  typescript: { interface: 'InvEquivalencia' },
  labels: { singular: 'Equivalencia', plural: 'Equivalencias' },
  admin: {
    useAsTitle: 'textoOriginal',
    group: 'Inventario',
    defaultColumns: ['textoOriginal', 'proveedor', 'claveProveedor', 'material', 'factor', 'confirmadaEn'],
    listSearchableFields: ['textoOriginal', 'claveProveedor', 'textoNormalizado'],
    description:
      'Cómo llama cada tienda a cada material nuestro. Cada vez que una persona confirma un empate, queda aquí; la siguiente vez el sistema lo reconoce solo. «Factor» convierte la unidad de la tienda a nuestra unidad base (1 tramo = 3.05 m).',
  },
  access: { ...accesoCatalogo, create: editaCatalogoInventario, update: editaCatalogoInventario },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data) return data
        data.textoNormalizado = textoDeBusqueda([data.textoOriginal])
        return data
      },
    ],
  },
  fields: [
    { name: 'textoOriginal', label: 'Texto tal como aparece en el documento', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'proveedor', label: 'Proveedor', type: 'relationship', relationTo: 'inv-proveedores', index: true, admin: { description: 'Vacío = sirve para cualquier documento (p. ej. las listas del residente).' } },
        { name: 'claveProveedor', label: 'Clave del proveedor', type: 'text', index: true, admin: { description: 'La clave de producto de la tienda, si la pone.' } },
      ],
    },
    { name: 'material', label: 'Material', type: 'relationship', relationTo: 'inv-materiales', required: true, index: true },
    {
      type: 'row',
      fields: [
        {
          name: 'unidadOriginal',
          label: 'Unidad del documento',
          type: 'text',
          required: true,
          admin: { description: 'Como viene en el documento: pza, tramo, m, kg…' },
        },
        { name: 'factor', label: 'Factor a unidad base', type: 'number', required: true, defaultValue: 1, min: 0, admin: { description: '1 unidad del documento = factor × unidad base. Ej. 1 tramo = 3.05 m.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'confirmadaPor', label: 'Confirmada por', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
        { name: 'confirmadaEn', label: 'Fecha', type: 'text', admin: { readOnly: true } },
        { name: 'documentoOrigen', label: 'Documento de origen', type: 'relationship', relationTo: 'inv-documentos', admin: { readOnly: true } },
      ],
    },
    { name: 'textoNormalizado', type: 'text', index: true, admin: { hidden: true } },
    { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
  ],
}

export const InvUbicaciones: CollectionConfig = {
  slug: 'inv-ubicaciones',
  typescript: { interface: 'InvUbicacion' },
  labels: { singular: 'Ubicación', plural: 'Ubicaciones' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Inventario',
    defaultColumns: ['nombre', 'tipo', 'obra', 'activa'],
    description: 'Dónde puede haber material: la bodega, cada obra en curso (ligada a Obras y áreas de Finanzas), un vehículo o «en tránsito». Al terminar una obra, desactiva su ubicación: lo que quede ahí aparece como «por recuperar».',
  },
  access: accesoCatalogo,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true },
        {
          name: 'tipo',
          label: 'Tipo',
          type: 'select',
          required: true,
          defaultValue: 'bodega',
          options: [
            { label: 'Bodega', value: 'bodega' },
            { label: 'Obra', value: 'obra' },
            { label: 'Vehículo', value: 'vehiculo' },
            { label: 'En tránsito', value: 'transito' },
          ],
        },
      ],
    },
    { name: 'obra', label: 'Obra (Finanzas)', type: 'relationship', relationTo: 'fin-actividades', index: true, admin: { condition: (d) => d?.tipo === 'obra', description: 'La obra de Finanzas a la que corresponde. Una por ubicación.' } },
    { name: 'responsable', label: 'A cargo de', type: 'relationship', relationTo: 'users' },
    { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
}

export const InvConfiguracion: GlobalConfig = {
  slug: 'inv-configuracion',
  typescript: { interface: 'InvConfiguracion' },
  label: 'Configuración de Inventario',
  admin: { group: 'Inventario' },
  access: { read: usaInventarioOPanel, update: configuraInventario },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'tasaIva', label: 'IVA (%)', type: 'number', required: true, defaultValue: 16, min: 0, max: 100 },
        { name: 'umbralAlertaPrecio', label: 'Alerta si un precio cambia más de (%)', type: 'number', required: true, defaultValue: 5, min: 0, max: 100 },
        { name: 'diasPrecioViejo', label: 'Un precio se considera viejo después de (días)', type: 'number', required: true, defaultValue: 45, min: 1 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'umbralConfianzaEmpate', label: 'Confianza mínima para proponer un empate (0 a 1)', type: 'number', required: true, defaultValue: 0.85, min: 0, max: 1 },
        { name: 'proveedorPreferido', label: 'Proveedor preferido por defecto', type: 'relationship', relationTo: 'inv-proveedores', admin: { description: 'El primero que se usa al pronosticar el costo de una requisición.' } },
      ],
    },
    {
      name: 'avisosMateriales',
      label: 'Quién recibe el aviso de documentos por revisar',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      admin: { description: 'Vacío = superadministradores y roles con «Confirmar documentos y precios».' },
    },
  ],
}
