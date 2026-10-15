# ELGO Finanzas

App de registro de entradas, gastos y compromisos de **Constructora Eléctrica del Golfo (ELGO)**, Xalapa: obra pública y privada. Es una réplica de **Orthopedic Vet's Finanzas** (repo `JanoM91/Orthopedic-Vets-Medical`), que a su vez replica **MacAuto Finanzas** (repo `Exkalibur-labs/macauto-xalapa`, docs/60–62), **tropicalizada a una constructora**: cada entrada o gasto se asigna a una **obra** o a un **área de soporte** (colección `fin-actividades`), a «general» o queda pendiente. La pantalla **Obras** da el resultado por obra.

Proyecto de Exkalibur Consulting. Es la primera app de ELGO; las siguientes (compras con agente cotizador, clientes y proveedores, concursos) se apoyarán en ella. Operación y arranque: `docs/OPERACION.md`.

## Stack (no cambiar sin consultar)

- Next.js 16 (App Router) + TypeScript estricto · Payload CMS 3 embebido (`/admin`).
- **Base de datos: PostgreSQL en Supabase** (proyecto pendiente de crear). `DATABASE_URL` con un rol propio dueño de las tablas (`payload_app`) por el pooler en modo transacción (puerto 6543). La app NO usa la API REST de Supabase: Payload se conecta directo a Postgres.
- **Esquema por migraciones** (`migrations/`), con `push: false`. En producción Payload aplica solas las migraciones pendientes al arrancar (`prodMigrations`).
- Comprobantes en un almacén **privado** de Vercel Blob (`FINANZAS_BLOB_READ_WRITE_TOKEN`).
- IA con **Claude** (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) en `lib/finanzas/lectura.ts` y la nota de voz: interpreta la **nota de voz**, lee la **foto de ticket** y arma los **pagos a plazos**. La voz siempre pasa por el **dictado del navegador** (no se sube audio). Sin llave, esas tres responden 503 y lo demás funciona.
- Avisos por correo (`lib/notify.ts`, Resend: `RESEND_API_KEY`, `LEADS_FROM_EMAIL`) cuando alguien propone una categoría u obra que no existe. Sin llaves no truena: el pendiente se ve en Pendientes.
- Deploy: Vercel (producción = rama `main`). **Dominio: https://elgo-constructora.com** (DNS en Cloudflare, registros «DNS only»; `www` redirige a la raíz; `elgo-finanzas.vercel.app` redirige al dominio en `next.config.mjs`).
- **Estructura del sitio**: `/` = página pública de ELGO (`app/(frontend)`, textos en `lib/landing.ts`); **todas las aplicaciones del equipo viven en `/admin`** (Finanzas hoy; agente cotizador y control de inventario después).
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

## Heredado de MacAuto (14-oct-2026; docs/63 y 68 de ese repo)

- **Propuestas**: quien registra puede escribir una categoría u obra que no existe (`categoriaPropuesta`, `actividadPropuesta`); queda pendiente de asignar y se avisa por correo a quien se elija en Configuración (`avisosClasificacion`). Al clasificar, administración la da de alta (`crearCategoria`, `crearActividad` + `tipoActividad` obra/área). Equivale a los «autos provisionales» de MacAuto, que aquí no existen.
- **Foto de ticket** (`POST ticket`, `Ticket.tsx`, `Revisar.tsx`): Claude lee el ticket; se guarda un gasto por concepto (`grupoTicket`, `porRevisar`) repartiendo el total; quien capturó lo completa o lo descarta.
- **Pagos a plazos** (`POST plazos/interpretar` y `plazos`, `Plazos.tsx`): se dicta el plan, Claude lo interpreta, se guarda una operación con `calendario` (cuotas) y los pagos ya hechos.
- Migración `20261014_193722_propuestas_tickets_plazos`.
- **No** se trajo el CRM de clientes de MacAuto (propio de la agencia).

## Cambios al modelo de datos

1. Cambia la colección.
2. `npm run migrate:create nombre_del_cambio` contra una base **local** (nunca la de producción).
3. Si la migración crea tablas, agrega al final `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (ver `migrations/20261012_145900_rls_supabase.ts`).
4. `npm run generate:types`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
5. Al desplegar, Payload aplica la migración solo.

## Diseño

Paleta ELGO (14-oct-2026): **grises cálidos y café**, fondo blanco. Tokens en `app/(payload)/custom.css` (`--mx-*`; los nombres «navy» y «teal» se heredan): primario café `#6b4a33` (botones, selección), acento café claro `#8c6849`, **gris carbón `#2e2c2a`** (`--mx-carbon*`: encabezado de Finanzas, menú lateral, acceso, bienvenida y barra de estado del celular), gris claro del logotipo `#d9d4ce` sobre fondos oscuros, texto de acento `#6e4b31`, tinta `#1d1b19`. Contraste AA verificado (blanco sobre café ≥ 5:1).

**Logotipo oficial**: tres trazos grises (`#626262`), vectorizados del archivo de ELGO en `scripts/marca-elgo/generar-logos.py` (polígonos medidos) → `public/logo-mark.svg`, `logo-elgo.png` (isotipo + ELGO, acceso), `logo-mark.png`, `logo-mark-white.png` (apaisados). Iconos del celular en `public/finanzas/` con `scripts/iconos-finanzas/generar-iconos.py` (isotipo + ELGO sobre gris carbón). La palabra ELGO bajo el isotipo es Inter Display ExtraBold; cambiarla si ELGO entrega su tipografía.

## Convenciones

Contenido visible en español de México; código y commits en inglés, convencionales. Secretos solo en variables de entorno; `NEXT_PUBLIC_*` nunca como «Sensitive» en Vercel. Toda la información de ELGO es confidencial.
