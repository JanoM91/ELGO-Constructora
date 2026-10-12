# ELGO Finanzas

App de registro de entradas, gastos y compromisos de **Constructora Eléctrica del Golfo (ELGO)**, Xalapa: obra pública y privada. Es una réplica de **Orthopedic Vet's Finanzas** (repo `JanoM91/Orthopedic-Vets-Medical`), que a su vez replica **MacAuto Finanzas** (repo `Exkalibur-labs/macauto-xalapa`, docs/60–62), **tropicalizada a una constructora**: cada entrada o gasto se asigna a una **obra** o a un **área de soporte** (colección `fin-actividades`), a «general» o queda pendiente. La pantalla **Obras** da el resultado por obra.

Proyecto de Exkalibur Consulting. Es la primera app de ELGO; las siguientes (compras con agente cotizador, clientes y proveedores, concursos) se apoyarán en ella. Operación y arranque: `docs/OPERACION.md`.

## Stack (no cambiar sin consultar)

- Next.js 16 (App Router) + TypeScript estricto · Payload CMS 3 embebido (`/admin`).
- **Base de datos: PostgreSQL en Supabase** (proyecto pendiente de crear). `DATABASE_URL` con un rol propio dueño de las tablas (`payload_app`) por el pooler en modo transacción (puerto 6543). La app NO usa la API REST de Supabase: Payload se conecta directo a Postgres.
- **Esquema por migraciones** (`migrations/`), con `push: false`. En producción Payload aplica solas las migraciones pendientes al arrancar (`prodMigrations`).
- Comprobantes en un almacén **privado** de Vercel Blob (`FINANZAS_BLOB_READ_WRITE_TOKEN`).
- Nota de voz: el **dictado del navegador** convierte la voz en texto y **Claude** (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) lo interpreta y propone la obra. No se sube audio. Sin llave, responde 503 y lo demás funciona.
- Deploy: Vercel (producción = rama `main`).
- Una instalación (base, Vercel y Blob propios) por empresa. Ver «Pendiente» en `docs/OPERACION.md` sobre multiempresa.

## Reglas heredadas (no romper)

- **Todo lo que escribe en `fin-*` pasa por `lib/finanzas/servicio.ts`** (expuesto en `app/api/finanzas/[...ruta]/route.ts`). `fin-operaciones`, `fin-movimientos`, `fin-comprobantes` y `fin-bitacora` responden 403 en la API genérica de Payload, incluso al superadmin.
- Permisos en `lib/permisos.ts` (con Payload) y `lib/permisosBase.ts` (puro). Roles editables en `roles`; `esSuperadmin` en `users`. **La primera cuenta de la instalación nace superadmin**; después, toda cuenta nueva exige «Rol de acceso».
- Toda colección nueva se envuelve con `protegerColeccion` (ya lo hace `payload.config.ts`).
- Dinero en **centavos enteros** para calcular (`lib/finanzas/reglas.ts`); en la base, pesos. Fechas reales como texto `AAAA-MM-DD` en la zona del negocio.
- Nada financiero se borra: se corrige o se anula con motivo; todo queda en `fin-bitacora`.
- Pantallas de Finanzas: probar de 320 a 430 px y campos de 16 px.
- Pruebas sin base: `npm run test:finanzas` (también en CI).

## Lo propio de ELGO

- `fin-actividades` = **Obras y áreas** (el nombre técnico se hereda). Campos extra: `tipo` (obra / área de soporte), `clave`, `cliente`, `sector` (público / privado), `importeContratado` (con IVA), `notas`. Una obra terminada se **desactiva**: deja de salir al registrar y conserva sus números.
- `obras()` en el servicio + `GET /api/finanzas/obras?estado&desde&hasta` + pantalla **Obras** (`Paginas.tsx`). Base devengada; cobrado, pagado y pendientes aparte. Permiso: «Ver resultado por obra» (`verUtilidad`).
- `GET /api/finanzas/operaciones?obra=<id>` filtra movimientos por obra.
- Catálogo sugerido (botón en Configuración): 3 áreas de soporte y 29 categorías de constructora. Los conceptos de obra **no** traen área sugerida: al registrarlos se elige la obra.
- Roles sugeridos: Dueño, Administración, Compras, Residente de obra.

## Cambios al modelo de datos

1. Cambia la colección.
2. `npm run migrate:create nombre_del_cambio` contra una base **local** (nunca la de producción).
3. Si la migración crea tablas, agrega al final `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (ver `migrations/20261012_145900_rls_supabase.ts`).
4. `npm run generate:types`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
5. Al desplegar, Payload aplica la migración solo.

## Diseño

Paleta ELGO: azul marino, negro, grises y **fondo blanco**. Tokens en `app/(payload)/custom.css` (`--mx-*`; los nombres «navy» y «teal» se heredan): primario azul marino `#13294b`, acento `#3b5f8a`, gris del logotipo `#c9cdd3` sobre fondos oscuros, texto de acento `#24456f`, tinta `#111317`. Logotipos en `public/` (`logo-elgo.png`, `logo-mark.png`, `logo-mark-white.png`) generados por `scripts/marca-elgo/generar-logos.py` — **recreación provisional** hasta tener el vector oficial. Iconos del celular en `public/finanzas/` (`scripts/iconos-finanzas/generar-iconos.py`).

## Convenciones

Contenido visible en español de México; código y commits en inglés, convencionales. Secretos solo en variables de entorno; `NEXT_PUBLIC_*` nunca como «Sensitive» en Vercel. Toda la información de ELGO es confidencial.
