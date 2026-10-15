/**
 * Textos de la página de inicio pública (elgo-constructora.com).
 *
 * Todo lo que ve un visitante vive aquí para cambiarlo sin tocar el diseño.
 * Solo se publica lo que ELGO confirmó; los datos de contacto que estén en
 * null no se muestran.
 */
export const landing = {
  nombreCompleto: 'Constructora Eléctrica del Golfo',
  ciudad: 'Xalapa, Veracruz',
  titulo: 'Construcción eléctrica para obra pública y privada',
  subtitulo:
    'Ejecutamos obra eléctrica con control de cada obra: materiales, compras y costos en orden de principio a fin.',
  servicios: [
    {
      titulo: 'Obra eléctrica',
      texto: 'Instalaciones y obra eléctrica, con la obra civil que cada proyecto requiere.',
    },
    {
      titulo: 'Obra pública',
      texto: 'Participamos en concursos y licitaciones, y ejecutamos contratos con dependencias de gobierno.',
    },
    {
      titulo: 'Obra privada',
      texto: 'Proyectos para empresas, comercios y desarrollos, con seguimiento cercano al cliente.',
    },
  ],
  /** Aplicaciones del equipo (todas viven en /admin). */
  aplicaciones: [
    { nombre: 'Finanzas', texto: 'Entradas, gastos y resultado por obra.', disponible: true, ruta: '/admin/finanzas' },
    { nombre: 'Agente cotizador', texto: 'Cotizaciones a proveedores y cuadros comparativos.', disponible: false, ruta: '/admin' },
    { nombre: 'Control de inventario', texto: 'Material en almacén y en cada obra.', disponible: false, ruta: '/admin' },
  ],
  contacto: {
    /** Ej. '+52 228 123 4567' (se muestra y se usa para llamar). */
    telefono: null as string | null,
    /** Solo dígitos con lada de país, ej. '522281234567' (abre WhatsApp). */
    whatsapp: null as string | null,
    correo: null as string | null,
  },
}
