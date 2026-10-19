import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { gestionaUsuarios } from '../lib/permisos'

/**
 * Roles editables (heredado de MacAuto Finanzas).
 *
 * QUÉ ES: cada rol es una lista de casillas. Los dueños y el superadministrador
 * deciden qué puede hacer cada rol y le asignan uno a cada persona (en
 * Usuarios → «Rol de acceso»). Cambiar un rol cambia a todos los que lo tienen.
 *
 * DÓNDE SE APLICA: las casillas no esconden botones; se revisan en el
 * servidor (lib/permisos.ts) en cada consulta, exportación, archivo y
 * respuesta. Esconder un botón no es seguridad.
 *
 * El superadministrador NO es un rol: es una marca en la cuenta
 * (Usuarios → «Superadministrador») que solo otro superadministrador otorga.
 *
 * REPLICABILIDAD: nada aquí es propio del giro. Las casillas de «Finanzas»
 * sirven igual para cualquier negocio.
 */
export const Roles: CollectionConfig = {
  slug: 'roles',
  typescript: { interface: 'Rol' },
  labels: { singular: 'Rol', plural: 'Roles' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Sistema',
    defaultColumns: ['nombre', 'descripcion', 'updatedAt'],
    description:
      'Qué puede hacer cada tipo de persona. Lo editan los dueños y el superadministrador. Para asignarlo, entra a Usuarios.',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: gestionaUsuarios,
    update: gestionaUsuarios,
    delete: gestionaUsuarios,
  },
  hooks: {
    beforeDelete: [
      async ({ req, id }) => {
        const enUso = await req.payload.count({ collection: 'users', where: { rolDeAcceso: { equals: id } }, overrideAccess: true, req })
        if (enUso.totalDocs > 0) {
          throw new APIError(
            `Este rol lo tienen ${enUso.totalDocs} persona(s). Asígnales otro rol antes de borrarlo.`,
            400,
            undefined,
            true,
          )
        }
      },
    ],
  },
  fields: [
    { name: 'nombre', label: 'Nombre del rol', type: 'text', required: true, unique: true },
    { name: 'descripcion', label: 'Para quién es', type: 'text', admin: { description: 'Ej. «Recepción»' } },
    {
      name: 'panel',
      label: 'Panel',
      type: 'group',
      fields: [
        {
          name: 'acceso',
          label: 'Entra al panel completo (usuarios, roles y catálogos de Finanzas)',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Si se deja apagada, la persona entra directo a Finanzas y solo ve lo que su rol permite ahí.',
          },
        },
        {
          name: 'gestionarUsuarios',
          label: 'Administrar usuarios y roles',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Crear cuentas, asignar roles y editar lo que cada rol puede hacer.' },
        },
      ],
    },
    {
      name: 'finanzas',
      label: 'Finanzas',
      type: 'group',
      fields: [
        { name: 'registrar', label: 'Registrar entradas y gastos', type: 'checkbox', defaultValue: false },
        {
          name: 'ver',
          label: 'Qué movimientos ve',
          type: 'select',
          defaultValue: 'propios',
          required: true,
          options: [
            { label: 'Solo los que registró', value: 'propios' },
            { label: 'Los de ciertas obras o áreas (su alcance)', value: 'alcance' },
            { label: 'Todos', value: 'todos' },
          ],
        },
        {
          name: 'alcance',
          label: 'Obras y áreas de su alcance',
          type: 'relationship',
          relationTo: 'fin-actividades',
          hasMany: true,
          admin: { condition: (_, siblingData) => siblingData?.ver === 'alcance' },
        },
        {
          name: 'verRestringidas',
          label: 'Ver categorías restringidas (nómina)',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Sin esta casilla, la nómina no aparece en listas, búsquedas, reportes, exportaciones ni archivos.' },
        },
        {
          name: 'verSaldos',
          label: 'Ver saldos de cuentas y cajas',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Con el saldo antes y después de una quincena se puede deducir la nómina. Dalo solo a quien ya ve la nómina.' },
        },
        { name: 'verUtilidad', label: 'Ver resultado por obra (pantalla «Obras»)', type: 'checkbox', defaultValue: false },
        { name: 'liquidar', label: 'Registrar cobros y pagos de cualquier pendiente', type: 'checkbox', defaultValue: false },
        { name: 'corregir', label: 'Corregir, clasificar y anular registros', type: 'checkbox', defaultValue: false },
        { name: 'revisarComprobantes', label: 'Revisar comprobantes', type: 'checkbox', defaultValue: false },
        { name: 'configurar', label: 'Configurar cuentas, categorías, obras y áreas, y fecha de corte', type: 'checkbox', defaultValue: false },
        {
          name: 'moverDinero',
          label: 'Mover dinero: traspasos entre cuentas, fondos a empleados, aportaciones y retiros de socios',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Los roles con «Configurar» mueven dinero siempre; esta casilla es para dárselo a un rol que no configura (por ejemplo, un tesorero).' },
        },
      ],
    },
    /* ELGO Inventario (fase A, octubre de 2026): catálogo de materiales, cotizaciones, precios, requisiciones y existencias. */
    {
      name: 'inventario',
      label: 'Inventario',
      type: 'group',
      fields: [
        { name: 'usar', label: 'Usar Inventario (catálogo y consultas)', type: 'checkbox', defaultValue: false },
        { name: 'documentos', label: 'Subir cotizaciones, requisiciones y facturas, y revisar empates', type: 'checkbox', defaultValue: false },
        {
          name: 'confirmar',
          label: 'Confirmar documentos y precios',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Al confirmar se escribe el histórico de precios y las equivalencias. Incluye subir y revisar.' },
        },
        { name: 'verPrecios', label: 'Ver precios, comparativos y alertas', type: 'checkbox', defaultValue: false },
        { name: 'requisiciones', label: 'Crear requisiciones de material', type: 'checkbox', defaultValue: false },
        { name: 'movimientos', label: 'Registrar movimientos de existencias', type: 'checkbox', defaultValue: false },
        { name: 'configurar', label: 'Configurar Inventario (proveedores, familias, ubicaciones y parámetros)', type: 'checkbox', defaultValue: false, admin: { description: 'Incluye todo lo anterior.' } },
        {
          name: 'obras',
          label: 'Qué obras alcanza en Inventario',
          type: 'select',
          defaultValue: 'alcance',
          options: [
            { label: 'Solo las obras de su alcance en Finanzas (y la bodega)', value: 'alcance' },
            { label: 'Todas', value: 'todas' },
          ],
          admin: { description: 'Un residente solo ve y mueve material de sus obras. Si en Finanzas ve «Todos», aquí también, salvo que elijas otra cosa.' },
        },
      ],
    },
  ],
}
