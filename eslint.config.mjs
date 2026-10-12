// eslint.config.mjs — ELGO Finanzas (heredado de MacAuto vía Orthopedic Vet's Finanzas)
//
// Configuracion oficial de Next.js 16 (flat config nativo, sin FlatCompat).
// Solo requiere dos paquetes: eslint y eslint-config-next.
//
//   nextVitals -> reglas de Next.js + React + React Hooks, con las de
//                 Core Web Vitals elevadas a error.
//   nextTs     -> reglas de typescript-eslint.
//
// Docs: https://nextjs.org/docs/app/api-reference/config/eslint

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ─── Excepciones, decididas una por una el 27 de agosto de 2026 ───────
  //
  // La regla de aqui abajo es la UNICA que se baja de error a aviso, y esta
  // es la razon. Si algun dia se agrega otra, que sea con su explicacion.
  {
    rules: {
      // Cinco lugares leen del navegador (localStorage) dentro de un
      // useEffect y despues llaman a setState: la pagina de favoritos, el
      // widget de chat, el aviso de cookies, el boton de favorito y
      // lib/consent.ts.
      //
      // No es un descuido: NO se puede leer localStorage durante el render
      // porque rompe la hidratacion (el servidor no tiene localStorage).
      // Leerlo en un efecto es hoy el patron correcto en Next.js.
      //
      // El arreglo de verdad seria useSyncExternalStore, y es una
      // refactorizacion de cinco componentes — entre ellos el chat y el
      // consentimiento de cookies, que es material legal. Eso no se hace de
      // pasada mientras se enciende un linter.
      //
      // Queda como AVISO VISIBLE, no como bloqueo. Si algun dia se toca
      // alguno de esos componentes, es el momento de migrarlo.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  globalIgnores([
    // Salidas de compilacion
    '.next/**',
    'out/**',
    'build/**',
    'tsconfig.tsbuildinfo',

    // Archivos generados: no se editan a mano, no se lintean
    'next-env.d.ts',
    'payload-types.ts',
    'app/(payload)/admin/importMap.js',
    'migrations/*_inicial.ts',
    
    // Herramientas IA / temporales
    '.kilo/**',
  ]),
])

export default eslintConfig
