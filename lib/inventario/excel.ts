/**
 * Excel (.xlsx) → texto con tabuladores, en el NAVEGADOR y sin librerías.
 *
 * Claude no lee Excel directamente; convertirlo aquí evita subir el archivo y
 * agregar dependencias. Un .xlsx es un ZIP con XML: se ubican las hojas y las
 * cadenas compartidas, se descomprimen con `DecompressionStream('deflate-raw')`
 * (Chrome, Safari 16.4+, Firefox 113+) y se arma una fila de texto por renglón.
 * El .xls viejo (binario) no se puede: se pide guardarlo como .xlsx o PDF.
 */

type Entrada = { nombre: string; metodo: number; tamComprimido: number; inicioLocal: number }

function entradasZip(buf: ArrayBuffer): Entrada[] {
  const v = new DataView(buf)
  let fin = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('No es un archivo .xlsx válido.')
  const total = v.getUint16(fin + 10, true)
  let p = v.getUint32(fin + 16, true)
  const dec = new TextDecoder()
  const out: Entrada[] = []
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break
    const metodo = v.getUint16(p + 10, true)
    const tamComprimido = v.getUint32(p + 20, true)
    const lNombre = v.getUint16(p + 28, true)
    const lExtra = v.getUint16(p + 30, true)
    const lComent = v.getUint16(p + 32, true)
    const inicioLocal = v.getUint32(p + 42, true)
    out.push({ nombre: dec.decode(new Uint8Array(buf, p + 46, lNombre)), metodo, tamComprimido, inicioLocal })
    p += 46 + lNombre + lExtra + lComent
  }
  return out
}

async function leerEntrada(buf: ArrayBuffer, e: Entrada): Promise<string> {
  const v = new DataView(buf)
  const inicio = e.inicioLocal + 30 + v.getUint16(e.inicioLocal + 26, true) + v.getUint16(e.inicioLocal + 28, true)
  const datos = new Uint8Array(buf, inicio, e.tamComprimido)
  if (e.metodo === 0) return new TextDecoder().decode(datos)
  if (e.metodo !== 8) throw new Error('Compresión no soportada en el .xlsx.')
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(flujo).text()
}

const columna = (ref: string) => {
  const letras = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export async function excelATexto(archivo: File, maxFilas = 1500): Promise<string> {
  if (/\.xls$/i.test(archivo.name)) throw new Error('El formato .xls viejo no se puede leer: ábrelo y guárdalo como .xlsx o PDF.')
  const buf = await archivo.arrayBuffer()
  const entradas = entradasZip(buf)
  const parser = new DOMParser()
  const compartidas: string[] = []
  const ss = entradas.find((e) => e.nombre === 'xl/sharedStrings.xml')
  if (ss) {
    const doc = parser.parseFromString(await leerEntrada(buf, ss), 'application/xml')
    for (const si of Array.from(doc.getElementsByTagName('si'))) compartidas.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''))
  }
  const hojas = entradas.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.nombre)).sort((a, b) => Number(a.nombre.match(/\d+/)![0]) - Number(b.nombre.match(/\d+/)![0]))
  if (!hojas.length) throw new Error('El Excel no tiene hojas.')
  const partes: string[] = []
  let filas = 0
  for (const [i, h] of hojas.entries()) {
    const doc = parser.parseFromString(await leerEntrada(buf, h), 'application/xml')
    const lineas: string[] = []
    for (const row of Array.from(doc.getElementsByTagName('row'))) {
      const celdas: string[] = []
      for (const c of Array.from(row.getElementsByTagName('c'))) {
        const t = c.getAttribute('t')
        const val = c.getElementsByTagName('v')[0]?.textContent ?? ''
        let texto = val
        if (t === 's') texto = compartidas[Number(val)] ?? ''
        else if (t === 'inlineStr') texto = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent ?? '').join('')
        const col = columna(c.getAttribute('r') ?? '')
        celdas[col >= 0 ? col : celdas.length] = texto.replace(/[\t\r\n]+/g, ' ').trim()
      }
      const linea = Array.from(celdas, (x) => x ?? '').join('\t').replace(/\t+$/, '')
      if (linea.trim()) lineas.push(linea)
      if (++filas >= maxFilas) break
    }
    if (lineas.length) partes.push((hojas.length > 1 ? `### Hoja ${i + 1}\n` : '') + lineas.join('\n'))
    if (filas >= maxFilas) break
  }
  const texto = partes.join('\n\n')
  if (!texto.trim()) throw new Error('El Excel está vacío.')
  return texto
}
