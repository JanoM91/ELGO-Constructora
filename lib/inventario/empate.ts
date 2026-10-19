/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Inventario — empate por atributos (puro, sin imports)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Para renglones SIN clave conocida (otra tienda, una requisición escrita a
 * mano, una foto de WhatsApp). Saca de la descripción una «llave» de
 * atributos —tipo de pieza, medida, pared PG/PD, calibre, color, subtipo
 * (LL/LB/LR/C/T, recto/curvo) y polos×amperes— y busca en el catálogo los
 * materiales con la misma llave.
 *
 * Regla CONSERVADORA (la misma con la que se cargó el lote de M&M): se
 * acepta un empate solo si queda exactamente UN candidato. Si quedan varios
 * es «ambiguo» y lo decide una persona; si no queda ninguno, es material
 * nuevo o se busca a mano. Tableros y gabinetes nunca se empatan por
 * atributos (cada uno es distinto).
 *
 * No importa nada para poder probarse con `node` pelón (scripts/probarInventario.mjs).
 */

export type LlaveAtributos = {
  tipo: string | null
  medida: string | null
  pared: 'pg' | 'pd' | null
  calibre: string | null
  color: string | null
  subtipo: string | null
  polosAmp: string | null
}

export type MaterialParaEmpate = {
  id: number
  descripcion: string
  numeroParte?: string | null
  atributos?: { polos?: number | string | null; amperes?: number | string | null } | null
}

/** Uniforma escritura y errores de dedo frecuentes en cotizaciones. */
export function normalizarParaLlave(s: string): string {
  let t = s.toUpperCase().replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4')
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Ñ/g, 'N')
  t = t.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2') // 1 /4 → 1/4
  t = t.replace(/\b(\d)(1\/2|1\/4|3\/4)\b/g, '$1 $2') // 11/4 → 1 1/4
  const erratas: [RegExp, string][] = [
    [/UNICNAL/g, 'UNICANAL'], [/EXPASION/g, 'EXPANSION'], [/CONECTROR/g, 'CONECTOR'], [/LICUATYTE|LIQUATITE|LIQUATAITE/g, 'LICUATITE'],
    [/PERFIN/g, 'PERFIL'], [/\bELGADA/g, 'DELGADA'], [/DDELGADA/g, 'DELGADA'],
  ]
  for (const [re, r] of erratas) t = t.replace(re, r)
  return t
}

const TIPOS: [string, RegExp][] = [
  ['condulet', /CONDULET/], ['tubo_licuatite', /LICUATITE/], ['tubo_licuaflex', /LICUAFLEX/],
  ['perfil_unicanal', /PERFIL/], ['abrazadera_unicanal', /ABRAZADERA UNICANAL/], ['abrazadera_una', /ABRAZADERA .*UNA\b/],
  ['tubo_pvc', /TUBO (DE )?PVC/], ['curva_pvc', /CURVA (DE )?PVC/], ['conector_pvc', /CONECTOR (DE )?PVC/],
  ['tubo_galv', /TUBO (CONDUIT )?GALV/], ['codo_galv', /(CODO|CURVA) (CONDUIT )?GALV/],
  ['cople', /COPLE/], ['conector_galv', /CONECTOR (CONDUIT )?GALV/], ['monitor', /MONITOR/], ['contratuerca', /CONTRATUERCA/],
  ['cable_desnudo', /DESNUDO/], ['cable_thw', /THW/], ['cable_uso_rudo', /USO RUDO/],
  ['zapata', /ZAPATA/], ['tuerca', /^TUERCA/], ['rondana', /RONDANA/], ['taquete_z', /(TAQUETE|EXPANSOR).*\bZ\b|TIPO "Z"/], ['ancla', /ANCLA/],
  ['varilla_tierra_cfe', /VARILLA .*(PROTOCOLO CFE|CON PROTOCOLO)/], ['varilla_tierra', /VARILLA .*(TIERRA|5\/8)/], ['varilla_roscada', /VARILLA GALV|BARRA ROSCADA/],
  ['interruptor_qo', /INTERRUPTOR .*QO|\bQO\s?\d/], ['cinta_33', /SUPER 33/],
]

function tipoDe(s: string): string | null {
  const t = s.trim()
  if (/^TABLERO/.test(t)) return 'tablero'
  if (/^GABINETE/.test(t)) return 'gabinete'
  if (t.includes('CONECTOR') && (t.includes('LICUATITE') || t.includes('LICUAFLEX'))) return 'conector_licuatite'
  for (const [tipo, re] of TIPOS) if (re.test(t)) return tipo
  return null
}

function medidaDe(s: string): string | null {
  const m =
    s.match(/(\d+ \d\/\d|\d\/\d|\b\d+)\s*("|''|”)/) ||
    s.match(/\d+MM (\d+ \d\/\d|\d\/\d|\d+)\b/) ||
    s.match(/\bDE (\d+ \d\/\d|\d\/\d|\d)\b/) ||
    s.match(/(?:GRUESA|DELGADA|P\/D|P\/DELGADA|PG|PD|GALV\.?|GALVANIZAD[OA]|UNICANAL(?: 43406)?) (?:DE )?(\d+ \d\/\d|\d\/\d|\d)\b/)
  if (m) return m[1]
  const fr = s.match(/\d+ \d\/\d|\b\d\/\d/g)
  if (fr?.length) return fr[fr.length - 1]
  const ent = s.trim().match(/\b[1-4]\b(?=\s*(?:"|$|\(|ACERO|RECTO|CURVO|T\/A))/g)
  return ent?.length ? ent[ent.length - 1] : null
}

function paredDe(s: string): 'pg' | 'pd' | null {
  if (/GRUESA|P\.?\s?G\b|\bPG\b/.test(s)) return 'pg'
  if (/DELGADA|P\.?\s?D\b|\bPD\b|P\/D/.test(s)) return 'pd'
  return null
}

function calibreDe(s: string): string | null {
  if (s.includes('USO RUDO')) {
    const m = s.match(/(\d)\s?X\s?(\d{1,2})(?=\s?(AWG|\/|$|\s))/)
    if (m) return `${m[1]}X${m[2]}`
  }
  const m = s.match(/CAL\.?\s*(\d+\/\d|\d+)/)
  return m ? m[1] : null
}

function colorDe(s: string): string | null {
  const t = s.replace(/ETIQUETA \w+/g, '')
  for (const [c, n] of [['NEGR', 'negro'], ['BLANC', 'blanco'], ['ROJ', 'rojo'], ['VERDE', 'verde'], ['VRDE', 'verde'], ['AZUL', 'azul']] as const) if (t.includes(c)) return n
  return null
}

export function llaveDe(descripcion: string): LlaveAtributos {
  const s = normalizarParaLlave(descripcion)
  const tipo = tipoDe(s)
  const sub = s.match(/TIPO (LL|LB|LR|C|T|FS)\b/)
  const pa = s.match(/(\d)\s?X\s?(\d{2,3})\b/) || s.match(/(\d)P\.?\s?(\d{2,3})/)
  const sinMedida = tipo === 'cable_thw' || tipo === 'cable_desnudo' || tipo === 'zapata' || tipo === 'cable_uso_rudo'
  return {
    tipo,
    medida: sinMedida ? null : medidaDe(s),
    pared: paredDe(s),
    calibre: calibreDe(s),
    color: colorDe(s),
    subtipo: sub ? sub[1] : s.includes('RECTO') ? 'recto' : s.includes('CURVO') ? 'curvo' : null,
    polosAmp: pa && tipo === 'interruptor_qo' ? `${pa[1]}x${pa[2]}` : null,
  }
}

const numeroParte = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export type IndiceEmpate<T extends MaterialParaEmpate> = {
  porTipo: Map<string, { m: T; k: LlaveAtributos }[]>
  porNumeroParte: Map<string, T>
}

export function indiceDeEmpate<T extends MaterialParaEmpate>(materiales: T[]): IndiceEmpate<T> {
  const porTipo = new Map<string, { m: T; k: LlaveAtributos }[]>()
  const porNumeroParte = new Map<string, T>()
  for (const m of materiales) {
    const k = llaveDe(m.descripcion)
    if (k.tipo) porTipo.set(k.tipo, [...(porTipo.get(k.tipo) ?? []), { m, k }])
    const np = numeroParte(m.numeroParte)
    if (np.length >= 4) porNumeroParte.set(np, m)
  }
  return { porTipo, porNumeroParte }
}

/** Un número de parte del catálogo que aparece dentro de la descripción (LAL36350, QO120…). */
export function porNumeroParte<T extends MaterialParaEmpate>(descripcion: string, indice: IndiceEmpate<T>): T | null {
  const s = descripcion.toUpperCase()
  if (/^\s*(GABINETE|TABLERO)/.test(s)) return null
  for (const tok of s.match(/[A-Z]{1,4}\d{2,6}[A-Z0-9]*/g) ?? []) {
    const m = indice.porNumeroParte.get(tok)
    if (m) return m
  }
  return null
}

/** Materiales del catálogo compatibles con la llave del texto (0, 1 o varios). */
export function candidatosPorAtributos<T extends MaterialParaEmpate>(descripcion: string, indice: IndiceEmpate<T>): T[] {
  const k = llaveDe(descripcion)
  if (!k.tipo || k.tipo === 'tablero' || k.tipo === 'gabinete') return []
  const lista = indice.porTipo.get(k.tipo) ?? []
  return lista
    .filter(({ m, k: mk }) => {
      if (k.tipo === 'interruptor_qo' && k.polosAmp) {
        const [p, a] = k.polosAmp.split('x')
        const at = m.atributos ?? {}
        if (at.polos != null && at.amperes != null) {
          if (String(at.polos) !== p || String(at.amperes) !== a) return false
        } else if (mk.polosAmp && mk.polosAmp !== k.polosAmp) return false
      }
      for (const campo of ['medida', 'calibre', 'subtipo', 'polosAmp'] as const) {
        if (k[campo] && mk[campo] && k[campo] !== mk[campo]) return false
        if (k[campo] && !mk[campo] && (campo === 'medida' || campo === 'calibre')) return false
      }
      for (const campo of ['pared', 'color'] as const) if (k[campo] && mk[campo] && k[campo] !== mk[campo]) return false
      return true
    })
    .map(({ m }) => m)
}

export type ResultadoEmpateAtributos<T> = { estado: 'empata' | 'ambiguo' | 'nuevo'; metodo: 'numero_parte' | 'descripcion' | null; candidatos: T[] }

/** Número de parte primero; luego atributos. Solo «empata» con un candidato único. */
export function empatarPorAtributos<T extends MaterialParaEmpate>(descripcion: string, indice: IndiceEmpate<T>): ResultadoEmpateAtributos<T> {
  const np = porNumeroParte(descripcion, indice)
  if (np) return { estado: 'empata', metodo: 'numero_parte', candidatos: [np] }
  const cs = candidatosPorAtributos(descripcion, indice)
  return { estado: cs.length === 1 ? 'empata' : cs.length ? 'ambiguo' : 'nuevo', metodo: cs.length ? 'descripcion' : null, candidatos: cs }
}
