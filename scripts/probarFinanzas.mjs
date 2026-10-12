/**
 * Pruebas de las reglas de Finanzas que no necesitan base de datos (heredadas
 * de MacAuto Finanzas, sin la parte de autos): dinero en centavos, fechas,
 * estados de pago, saldos, fondos, nota de voz y la tabla de permisos.
 *
 * Corre con `node` pelón porque lib/finanzas/reglas.ts y lib/permisosBase.ts
 * no importan nada:
 *
 *   npm run test:finanzas
 *
 * Las pruebas de los flujos completos (con base de datos) se corren contra una
 * base Postgres local, nunca contra la de producción (docs/OPERACION.md).
 */
import {
  aCentavos, aPesos, armarBorradorVoz, conceptoInterno, diasEntre, esFechaValida, estadoDePago, formatoMXN,
  resumenDeFondo, revisarFechaReal, saldoDeCuenta, sumarDias, tieneDosDecimalesOMenos,
} from '../lib/finanzas/reglas.ts'
import { calcularPermisos, esSoloCaptura, usaFinanzas } from '../lib/permisosBase.ts'

let fallas = 0
let total = 0
function ok(cond, texto) {
  total++
  if (cond) console.log(`  ✓ ${texto}`)
  else { fallas++; console.log(`  ✗ ${texto}`) }
}

console.log('\nDinero')
ok(aCentavos('1,250.50') === 125050, '«1,250.50» → 125,050 centavos')
ok(aCentavos('$850') === 85000, '«$850» → 85,000 centavos')
ok(aCentavos(0.1) + aCentavos(0.2) === aCentavos(0.3), '0.10 + 0.20 = 0.30 exacto en centavos')
ok(Number.isNaN(aCentavos('12.345')), 'Tres decimales no es un importe válido')
ok(Number.isNaN(aCentavos('abc')), 'Texto no es un importe')
ok(aPesos(333334) === 3333.34, '333,334 centavos → 3,333.34 pesos')
ok(tieneDosDecimalesOMenos(95000.5) && !tieneDosDecimalesOMenos(1.005), 'Detecta más de dos decimales')
ok(formatoMXN(33900000) === '$339,000', 'Formato $339,000 (sin centavos si no hay)')
ok(formatoMXN(333334, true) === '$3,333.34', 'Formato con centavos')
ok(formatoMXN(-5000) === '−$50', 'Negativos con signo menos')

console.log('\nFechas')
ok(esFechaValida('2026-02-28') && !esFechaValida('2026-02-31') && !esFechaValida('31/02/2026'), 'Rechaza fechas que no existen')
ok(sumarDias('2026-10-01', -1) === '2026-09-30', 'Resta días cruzando de mes')
ok(diasEntre('2026-09-28', '2026-10-08') === 10, 'Cuenta días entre fechas')
ok(revisarFechaReal('2026-10-09', '2026-10-08', null)?.includes('futura'), 'Una fecha futura se rechaza')
ok(revisarFechaReal('2026-09-27', '2026-10-08', '2026-09-28')?.includes('corte'), 'Una fecha anterior al corte se rechaza')
ok(revisarFechaReal('2026-09-28', '2026-10-08', '2026-09-28') === null, 'El mismo día del corte sí se acepta')

console.log('\nEstados y saldos')
ok(estadoDePago(23900000, 15000000, false).estado === 'parcial' && estadoDePago(23900000, 15000000, false).pendienteCentavos === 8900000, 'Estimación $239,000 con $150,000 cobrados → parcial, $89,000 pendiente')
ok(estadoDePago(85000, 0, false).estado === 'pendiente', 'Sin cobros → pendiente')
ok(estadoDePago(85000, 85000, false).estado === 'liquidado', 'Cobrado completo → liquidado')
ok(estadoDePago(85000, 0, true).estado === 'anulado' && estadoDePago(85000, 0, true).pendienteCentavos === 0, 'Anulado no deja pendiente')
ok(saldoDeCuenta(800000, [{ direccion: 'sale', centavos: 85000 }, { direccion: 'entra', centavos: 500000 }, { direccion: 'sale', centavos: 32000, anulado: true }]) === 1215000, 'Saldo = inicial + entradas − salidas, sin contar lo anulado')

console.log('\nPermisos')
const rolResidente = { nombre: 'Residente de obra', panel: { acceso: false }, finanzas: { registrar: true, ver: 'propios' } }
const rolResidenteObra = { nombre: 'Residente · Banderilla', panel: { acceso: false }, finanzas: { registrar: true, ver: 'alcance', alcance: [{ id: 2 }, 4] } }
const rolCompras = { nombre: 'Compras', panel: { acceso: false }, finanzas: { registrar: true, ver: 'todos', liquidar: true, revisarComprobantes: true } }
const pSuper = calcularPermisos({ esSuperadmin: true }, null)
ok(pSuper.superadmin && pSuper.fin.verRestringidas && pSuper.gestionarUsuarios && pSuper.panel, 'Superadministrador: puede todo')
const pRec = calcularPermisos({}, rolResidente)
ok(!pRec.panel && pRec.fin.registrar && esSoloCaptura(pRec), 'Residente: registra y entra directo a Finanzas')
ok(!pRec.fin.verRestringidas && !pRec.fin.verSaldos && !pRec.gestionarUsuarios && !pRec.fin.verUtilidad, 'Residente: sin nómina, sin saldos, sin usuarios, sin resultado por obra')
const pMed = calcularPermisos({}, rolResidenteObra)
ok(pMed.fin.ver === 'alcance' && pMed.fin.alcance.join(',') === '2,4' && esSoloCaptura(pMed), 'Residente con alcance: ve las obras 2 y 4, directo a Finanzas')
const pCom = calcularPermisos({}, rolCompras)
ok(pCom.fin.ver === 'todos' && pCom.fin.liquidar && !pCom.fin.verRestringidas && !pCom.fin.verSaldos && !pCom.fin.verUtilidad && !pCom.fin.moverDinero && esSoloCaptura(pCom), 'Compras: todas las obras y paga, sin nómina, saldos, resultado ni mover dinero')
const pSinRol = calcularPermisos({}, null)
ok(!pSinRol.panel && !usaFinanzas(pSinRol) && !pSinRol.gestionarUsuarios && pSinRol.rolNombre === 'Sin rol', 'Cuenta sin rol: no entra a nada')
ok(!calcularPermisos(null, null).panel, 'Sin sesión: nada')
const rolAdmon = { nombre: 'Administración', panel: { acceso: true }, finanzas: { registrar: true, ver: 'todos', configurar: true } }
ok(calcularPermisos({}, rolAdmon).fin.moverDinero, 'Quien configura mueve dinero aunque el rol no traiga la casilla')
ok(calcularPermisos({}, { ...rolAdmon, finanzas: { ...rolAdmon.finanzas, moverDinero: false } }).fin.moverDinero, 'Quien configura mueve dinero aunque la casilla esté apagada')
ok(!calcularPermisos({}, rolResidente).fin.moverDinero && pSuper.fin.moverDinero, 'El residente no mueve dinero; el superadministrador sí')
ok(usaFinanzas(calcularPermisos({}, { nombre: 'Tesorero', panel: { acceso: true }, finanzas: { moverDinero: true } })), 'Un rol que solo mueve dinero sí usa Finanzas')

console.log('\nFondos y dinero interno')
const fondo = resumenDeFondo(0, [
  { direccion: 'entra', centavos: 500000, modalidad: 'traspaso', fechaReal: '2026-10-01' },
  { direccion: 'sale', centavos: 85000, modalidad: 'contado', fechaReal: '2026-10-03' },
  { direccion: 'sale', centavos: 120000, modalidad: 'contado', fechaReal: '2026-10-05' },
  { direccion: 'sale', centavos: 295000, modalidad: 'traspaso', fechaReal: '2026-10-08' },
  { direccion: 'sale', centavos: 999, modalidad: 'contado', anulado: true, fechaReal: '2026-10-09' },
])
ok(fondo.entregadoCentavos === 500000 && fondo.comprobadoCentavos === 205000 && fondo.devueltoCentavos === 295000, 'Fondo: entregado $5,000, comprobado $2,050, devuelto $2,950')
ok(fondo.saldoCentavos === 0 && fondo.ultimoMovimiento === '2026-10-08', 'Fondo cerrado en cero; lo anulado no cuenta ni mueve la última fecha')
ok(resumenDeFondo(100000, [{ direccion: 'entra', centavos: 50000, modalidad: 'traspaso' }]).saldoCentavos === 150000, 'El saldo inicial del fondo cuenta')
ok(conceptoInterno('traspaso', 'Banco', 'Fondo · Residente Banderilla', null) === 'Traspaso Banco → Fondo · Residente Banderilla', 'Concepto sugerido de traspaso')
ok(conceptoInterno('aportacion', null, 'Banco', 'Jano') === 'Aportación de Jano' && conceptoInterno('retiro', 'Banco', null, null) === 'Retiro de socio', 'Concepto sugerido de aportación y retiro')

console.log('\nNota de voz: el borrador nunca inventa datos')
const cat = { cuentas: [{ id: 1, nombre: 'Banco' }, { id: 2, nombre: 'Fondo · Residente Banderilla' }], categorias: [{ id: 8, nombre: 'Material eléctrico', tipo: 'gasto' }, { id: 1, nombre: 'Estimación cobrada', tipo: 'entrada' }], actividades: [{ id: 3, nombre: 'Subestación Banderilla', tipo: 'obra' }] }
const v1 = armarBorradorVoz({ tipo: 'gasto', importe: 3200, concepto: 'Cable THW calibre 10, 500 m', categoriaId: 8, cuentaId: 2, estado: 'realizado', fechaReal: null, actividadId: 3, contraparte: null, notas: null, dudas: [] }, cat, '2026-10-09', '2026-09-01', 'pagué tres mil doscientos de cable para la obra de banderilla del fondo')
ok(v1.borrador.tipo === 'gasto' && v1.borrador.importe === '3200' && v1.borrador.cuenta === 2 && v1.borrador.categoria === 8 && v1.borrador.asig === 'actividad' && v1.borrador.actividad === 3, 'Nota clara: gasto $3,200, fondo del residente, Material eléctrico, obra Banderilla')
ok(v1.borrador.fechaReal === '2026-10-09' && v1.dudas.length === 0 && v1.borrador.notas.includes('Nota de voz: «pagué'), 'Sin fecha dicha → hoy; sin dudas; la transcripción queda en notas')
const v2 = armarBorradorVoz({ tipo: 'gasto', importe: 800, concepto: 'Diésel', categoriaId: 999, cuentaId: 77, estado: 'realizado', fechaReal: '2026-10-20', actividadId: 55, contraparte: null, notas: null, dudas: ['No dijiste la obra'] }, cat, '2026-10-09', '2026-09-01', 'x')
ok(v2.borrador.categoria === null && v2.borrador.cuenta === null && v2.borrador.fechaReal === '2026-10-09' && v2.borrador.actividad === null && v2.borrador.asig === null, 'Ids inventados (cuenta, categoría, obra) y fecha futura se descartan')
ok(v2.dudas.some((d) => d.includes('cuenta')) && v2.dudas.some((d) => d.includes('categoría')) && v2.dudas.some((d) => d.includes('fecha')) && v2.dudas.includes('No dijiste la obra'), 'Cada descarte queda como duda, más las del modelo')
const v3 = armarBorradorVoz({ tipo: 'entrada', importe: '1,250.50', concepto: 'Estimación 2 alumbrado', categoriaId: 8, cuentaId: 1, estado: 'realizado', fechaReal: '2026-10-08', actividadId: 3, contraparte: 'Municipio de Coatepec', notas: null, dudas: [] }, cat, '2026-10-09', null, 'x')
ok(v3.borrador.tipo === 'entrada' && v3.borrador.importe === '1250.50' && v3.borrador.categoria === null && v3.dudas.some((d) => d.includes('categoría')), 'Una categoría de gasto en una entrada se descarta')
ok(v3.borrador.fechaReal === '2026-10-08' && v3.borrador.contraparte === 'Municipio de Coatepec' && v3.borrador.actividad === 3, 'Fecha de ayer, contraparte y obra válidas se conservan')
const v4 = armarBorradorVoz({ tipo: 'gasto', importe: 300, concepto: 'Comida', categoriaId: null, cuentaId: null, estado: 'propio', fechaReal: null, actividadId: null, contraparte: null, notas: null, dudas: [] }, cat, '2026-10-09', null, 'x')
ok(v4.borrador.estado === 'propio' && v4.borrador.cuenta === null && !v4.dudas.some((d) => d.includes('cuenta')), '«De mi bolsa» no pide cuenta')
const v5 = armarBorradorVoz({ tipo: 'desconocido', importe: -5, concepto: '', categoriaId: null, cuentaId: null, estado: 'realizado', fechaReal: 'ayer', actividadId: null, contraparte: null, notas: null, dudas: [] }, cat, '2026-10-09', null, 'x')
ok(v5.borrador.tipo === 'gasto' && v5.borrador.importe === '' && v5.borrador.fechaReal === '2026-10-09' && v5.dudas.length >= 3, 'Tipo desconocido, importe negativo, concepto vacío y fecha no ISO → borrador vacío con dudas')

console.log(`\n${total - fallas}/${total} pruebas pasan`)
process.exit(fallas ? 1 : 0)
