/**
 * Pruebas de las reglas de Inventario que no necesitan base de datos:
 * unidades y factores, normalización de descripciones, empate por texto,
 * existencias desde movimientos, variación de precios, pronóstico y permisos.
 *
 * Corre con `node` pelón porque lib/inventario/reglas.ts y lib/permisosBase.ts
 * no importan nada:
 *
 *   npm run test:inventario
 *
 * Los casos de empate salen de las diferencias reales documentadas en el
 * proceso de cotización de ELGO (PG vs PD, tramos vs metros, kg vs metros).
 */
import {
  concentracion, conIva, cuadraSubtotal, existenciaDe, existenciasDesdeMovimientos, factorDeConversion, mejoresCandidatos, normalizarDescripcion,
  normalizarNumeroParte, normalizarPartida, normalizarUnidad, parecido, precioEstimado, resumenPronostico, revisarMovimiento, sinIva, variacionPct, esAlertaDePrecio, textoDeBusqueda,
} from '../lib/inventario/reglas.ts'
import { empatarPorAtributos, indiceDeEmpate, llaveDe } from '../lib/inventario/empate.ts'
import { calcularPermisos, esSoloCaptura, usaFinanzas, usaInventario } from '../lib/permisosBase.ts'

let fallas = 0
let total = 0
function ok(cond, texto) {
  total++
  if (cond) console.log(`  ✓ ${texto}`)
  else { fallas++; console.log(`  ✗ ${texto}`) }
}

console.log('\nUnidades')
ok(normalizarUnidad('PAQUETE') === 'paquete' && normalizarUnidad('H87') === 'pieza' && normalizarUnidad('PZAS.') === 'pieza' && normalizarUnidad('Mtr') === 'metro' && normalizarUnidad('KG') === 'kilogramo' && normalizarUnidad('tramos') === 'tramo', 'Reconoce pza, mtr, kg y tramos')
ok(normalizarUnidad('tonel') === null && normalizarUnidad('') === null, 'Lo desconocido devuelve null, no adivina')
ok(factorDeConversion('pieza', 'pieza') === 1, 'Misma unidad: factor 1')
ok(factorDeConversion('tramo', 'metro', { longitudTramo: 3.05 }) === 3.05, '1 tramo = 3.05 m si el material tiene longitud')
ok(factorDeConversion('tramo', 'metro', {}) === null, 'Tramo → metro sin longitud: null (lo resuelve una persona)')
ok(Math.abs(factorDeConversion('kilogramo', 'metro', { pesoPorMetroKg: 0.0296 }) - 1 / 0.0296) < 1e-9, 'kg → m con peso por metro')
ok(factorDeConversion('tramo', 'pieza') === 1, 'Un tramo de tubo es una pieza')
ok(factorDeConversion('caja', 'pieza') === null, 'Caja → pieza necesita equivalencia confirmada')
const n = normalizarPartida(6, 110747, 3.05)
ok(n.cantidadBase === 18.3 && n.precioBaseCentavos === 36310, '6 tramos a $1,107.47 → 18.3 m a $363.10/m')
ok(normalizarPartida(5, 1000, null).cantidadBase === null, 'Sin factor no se normaliza')
ok(sinIva(4872000, 16) === 4200000 && conIva(4200000, 16) === 4872000, '$48,720 con IVA ↔ $42,000 sin IVA')

console.log('\nTexto y empate')
ok(normalizarDescripcion('Tubo Conduit Galv. Pared Gruesa 2 1/2"') === 'tubo conduit galv pg 2-1/2in', 'Normaliza pared gruesa y 2 1/2"')
ok(normalizarDescripcion('TUBO GALV. P.D. 2" S/COPLE') === 'tubo galv pd 2in s/cople', 'Normaliza P.D. y 2"')
ok(normalizarDescripcion('Interruptor termomagnético 3x350 A LAL36350') === 'interruptor termomagnetico 3x350 amp lal36350', 'Quita acentos y uniforma 3x350 A')
ok(textoDeBusqueda(['Tubo', null, 'Rymco', '2"']) === 'tubo rymco 2in', 'Texto de búsqueda junta partes y omite vacíos')
const pgVsPd = parecido('Cople galv. PG 1 1/2"', 'Cople galvanizado pared delgada 1 1/2"')
ok(pgVsPd <= 0.4, `PG contra PD no empata (${pgVsPd.toFixed(2)})`)
const mismo = parecido('TUBO CONDUIT GALV PG 2"', 'Tubo conduit galvanizado pared gruesa 2"')
ok(mismo >= 0.85, `Misma cosa con distinta redacción empata (${mismo.toFixed(2)})`)
const otraMedida = parecido('Tubo conduit galv PG 2"', 'Tubo conduit galv PG 1 1/4"')
ok(otraMedida < mismo && otraMedida < 0.8, `Otra medida queda por debajo del umbral (${otraMedida.toFixed(2)})`)
const catalogo = [
  { id: 1, descripcion: 'Tubo conduit galvanizado pared gruesa 2"' },
  { id: 2, descripcion: 'Tubo conduit galvanizado pared delgada 2"' },
  { id: 3, descripcion: 'Tubo conduit galvanizado pared gruesa 1 1/4"' },
  { id: 4, descripcion: 'Interruptor LAL36350 3P 350 A' },
]
const cands = mejoresCandidatos('TUBO GALV. PG 2" C/COPLE', catalogo)
ok(cands[0]?.material.id === 1, 'El mejor candidato para «tubo galv PG 2"» es el PG 2"')
ok(!cands.some((c) => c.material.id === 4), 'Un interruptor no aparece como candidato de un tubo')
ok(normalizarNumeroParte('lal 36350-MB') === 'LAL36350MB', 'Número de parte sin espacios ni guiones')

console.log('\nExistencias')
const movs = [
  { material: 7, cantidad: 100, origen: null, destino: 1 },           // entrada a bodega (1)
  { material: 7, cantidad: 30, origen: 1, destino: 2 },               // salida a obra (2)
  { material: 7, cantidad: 5, origen: 2, destino: 1 },                // devolución
  { material: 7, cantidad: 10, origen: 1, destino: 2, anulado: true }, // anulado: no cuenta
  { material: 8, cantidad: 12.5, origen: null, destino: 1 },
]
const ex = existenciasDesdeMovimientos(movs)
ok(existenciaDe(ex, 7, 1) === 75 && existenciaDe(ex, 7, 2) === 25, 'Bodega 75, obra 25: suma de movimientos sin los anulados')
ok(existenciaDe(ex, 8, 1) === 12.5 && existenciaDe(ex, 8, 2) === 0, 'Decimales y ubicación sin material')
ok(revisarMovimiento('entrada_compra', 10, null, 1) === null && revisarMovimiento('entrada_compra', 10, null, null) !== null, 'Entrada exige destino')
ok(revisarMovimiento('traspaso', 10, 1, 1) !== null && revisarMovimiento('traspaso', 10, 1, 2) === null, 'Traspaso exige origen ≠ destino')
ok(revisarMovimiento('salida_obra', 0, 1, 2) !== null, 'Cantidad cero se rechaza')

console.log('\nPrecios')
ok(variacionPct(4200000, 4410000) === 5 && variacionPct(null, 100) === null, 'Variación 5 %; sin anterior → null')
ok(esAlertaDePrecio(5.01, 5) && !esAlertaDePrecio(5, 5) && !esAlertaDePrecio(-4, 5), 'Alerta solo por arriba del umbral, en ambos sentidos')
const precios = [
  { proveedor: 1, fecha: '2026-09-30', precioBaseCentavos: 4200000 },
  { proveedor: 2, fecha: '2026-10-05', precioBaseCentavos: 3990000 },
  { proveedor: 1, fecha: '2026-07-01', precioBaseCentavos: 4000000 },
]
const e1 = precioEstimado(precios, '2026-10-19', 45, 1)
ok(e1.regla === 'preferido' && e1.precioBaseCentavos === 4200000, 'Preferido vigente gana aunque otro sea más barato')
const e2 = precioEstimado(precios, '2026-10-19', 45, null)
ok(e2.regla === 'mejor_vigente' && e2.proveedor === 2, 'Sin preferido: el mejor precio vigente')
const e3 = precioEstimado(precios, '2027-03-01', 45, 1)
ok(e3.regla === 'ultimo_viejo' && e3.viejo && e3.fecha === '2026-10-05', 'Todo viejo: el último conocido, marcado viejo')
ok(precioEstimado([], '2026-10-19', 45, 1).regla === 'sin_precio', 'Sin precios: sin precio')
const r = resumenPronostico([
  { cantidadBase: 3, estimado: e1 },
  { cantidadBase: 10, estimado: { precioBaseCentavos: null, proveedor: null, fecha: null, regla: 'sin_precio', viejo: false } },
  { cantidadBase: 2, estimado: e3 },
], 16)
ok(r.subtotalCentavos === 3 * 4200000 + 2 * 3990000 && r.conPrecio === 2 && r.sinPrecio === 1 && r.conPrecioViejo === 1, 'Pronóstico suma solo lo que tiene precio y cuenta viejos y faltantes')
ok(Math.abs(r.coberturaPct - 66.7) < 0.01 && r.totalCentavos === conIva(r.subtotalCentavos, 16), 'Cobertura 66.7 % y total con IVA')
const c = concentracion([{ n: 'LAL36350 ×3', importeCentavos: 12600000 }, { n: 'tableros', importeCentavos: 8000000 }, { n: 'tubo', importeCentavos: 1000000 }, { n: 'coples', importeCentavos: 500000 }])
ok(c.top.length === 2 && c.top[0].n === 'LAL36350 ×3' && c.pctDelTotal > 90, 'Dos partidas concentran más del 80 % del importe')
ok(cuadraSubtotal([100000, 250050, 49950], 400000) && !cuadraSubtotal([100000, 250050], 400000), 'Cuadre de subtotal con tolerancia de $1')

console.log('\nEmpate por atributos (renglones sin clave)')
const catAtr = indiceDeEmpate([
  { id: 1, descripcion: 'CONDULET TIPO LB 3/4" CROUSE' },
  { id: 2, descripcion: 'CONDULET TIPO LL 3/4" CROUSE' },
  { id: 3, descripcion: 'TUBO CONDUIT GALV. PARED GRUESA 2"' },
  { id: 4, descripcion: 'TUBO CONDUIT GALV. PARED DELGADA 2"' },
  { id: 5, descripcion: 'INTERRUPTOR QO 2X20 SQUARE D', numeroParte: 'QO220', atributos: { polos: 2, amperes: 20 } },
  { id: 6, descripcion: 'INTERRUPTOR QO 1X20 SQUARE D', numeroParte: 'QO120', atributos: { polos: 1, amperes: 20 } },
  { id: 7, descripcion: 'CABLE THW CAL. 12 NEGRO' },
  { id: 8, descripcion: 'CABLE THW CAL. 12 BLANCO' },
  { id: 9, descripcion: 'TABLERO NQ 30 CIRCUITOS' },
])
ok(llaveDe('Condulet tipo LB de 3/4"').subtipo === 'LB' && llaveDe('TUBO GALV P.D. 1 1/4"').medida === '1 1/4', 'Llave: subtipo LB y medida 1 1/4')
ok(empatarPorAtributos('CONDULET LB 3/4" (TIPO LB)', catAtr).candidatos[0]?.id === 1, 'Condulet LB 3/4" empata con el LB, no con el LL')
ok(empatarPorAtributos('TUBO GALVANIZADO PG 2"', catAtr).estado === 'empata' && empatarPorAtributos('TUBO GALVANIZADO PG 2"', catAtr).candidatos[0].id === 3, 'Tubo galv PG 2" empata con pared gruesa')
ok(empatarPorAtributos('TUBO GALV 2"', catAtr).estado === 'ambiguo', 'Sin pared: ambiguo (lo decide una persona)')
ok(empatarPorAtributos('PASTILLA QO220 2 POLOS', catAtr).metodo === 'numero_parte', 'Número de parte dentro del texto gana')
ok(empatarPorAtributos('INTERRUPTOR QO 1P 20A', catAtr).candidatos.map((c) => c.id).join() === '6', 'QO por polos × amperes')
ok(empatarPorAtributos('CABLE THW 12 ROJO', catAtr).estado !== 'empata', 'Cable de otro color no empata')
ok(empatarPorAtributos('TABLERO NQ 30 CIRCUITOS', catAtr).estado === 'nuevo', 'Tableros nunca se empatan por atributos')

console.log('\nPermisos de Inventario')
const pSuper = calcularPermisos({ esSuperadmin: true }, null)
ok(pSuper.inv.configurar && pSuper.inv.obras === 'todas' && usaInventario(pSuper), 'Superadministrador: todo en Inventario')
const rolResidente = { nombre: 'Residente', panel: { acceso: false }, finanzas: { registrar: true, ver: 'alcance', alcance: [2] }, inventario: { requisiciones: true, movimientos: true } }
const pRes = calcularPermisos({}, rolResidente)
ok(pRes.inv.usar && pRes.inv.requisiciones && pRes.inv.movimientos && !pRes.inv.confirmar && !pRes.inv.verPrecios && pRes.inv.obras === 'alcance', 'Residente: requisiciones y movimientos de sus obras, sin precios')
const rolCompras = { nombre: 'Compras', panel: { acceso: false }, finanzas: { registrar: true, ver: 'todos' }, inventario: { confirmar: true, requisiciones: true, movimientos: true } }
const pCom = calcularPermisos({}, rolCompras)
ok(pCom.inv.documentos && pCom.inv.confirmar && pCom.inv.verPrecios && !pCom.inv.configurar && pCom.inv.obras === 'todas', 'Compras: confirmar incluye subir y ver precios; todas las obras por Finanzas')
const rolSoloInv = { nombre: 'Almacén', panel: { acceso: false }, finanzas: {}, inventario: { movimientos: true } }
const pAlm = calcularPermisos({}, rolSoloInv)
ok(!usaFinanzas(pAlm) && usaInventario(pAlm) && esSoloCaptura(pAlm), 'Un rol solo de Inventario entra directo (sin panel) aunque no use Finanzas')
const rolViejo = { nombre: 'Administración', panel: { acceso: true }, finanzas: { registrar: true, ver: 'todos', configurar: true } }
ok(!usaInventario(calcularPermisos({}, rolViejo)), 'Un rol guardado antes del módulo no usa Inventario hasta que se le marque')
ok(calcularPermisos({}, { ...rolViejo, inventario: { configurar: true } }).inv.confirmar, 'Configurar Inventario incluye confirmar')

console.log(`\n${total - fallas}/${total} pruebas pasaron`)
if (fallas) process.exit(1)
