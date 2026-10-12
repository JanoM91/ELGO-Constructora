# Operación — ELGO Finanzas

> Réplica de Orthopedic Vet's Finanzas (y esta, de MacAuto Finanzas) para Constructora Eléctrica del Golfo, tropicalizada a constructora (12 de octubre de 2026). Lo que hace cada pantalla está explicado en los docs 60, 61 y 62 del repositorio de MacAuto; aquí va lo que es distinto y cómo se opera esta instalación.

## 1. Qué cambió respecto a Orthopedic Vet's Finanzas

| Tema | Orthopedic Vet's | ELGO |
|---|---|---|
| A qué se asigna una entrada o gasto («bolsas») | Un área de la clínica | **Una obra** (con clave, cliente, sector público/privado e importe contratado) o un **área de soporte**: Oficina y administración, Concursos y licitaciones, Maquinaria, vehículos y almacén. También «general» o «no sé todavía». |
| Resultado | No había pantalla por área | **Obras**: por cada obra, entradas, gastos, resultado, cobrado, por cobrar, pagado, por pagar, flujo y % cobrado del contrato. Filtros: en curso / terminadas / todas y desde el inicio / este año / 90 días. «Ver movimientos» abre la lista filtrada por esa obra. |
| Categorías sugeridas (conceptos) | 20 de clínica | **29 de constructora.** Entradas: anticipo, estimación cobrada, finiquito, cobro de obra privada, devolución de retenciones o fondo de garantía, venta de sobrante o chatarra, otras. Gastos de obra: material eléctrico, material de obra civil, subcontratos, raya y destajos, renta de maquinaria, combustibles, fletes, herramienta menor, EPP, viáticos, trámites/pruebas/dictámenes, fianzas y seguros. Gastos de soporte: bases de licitación, mantenimiento de maquinaria, **nómina administrativa (restringida)**, renta de oficina y bodega, servicios, contabilidad, impuestos, comisiones bancarias, papelería, otros. |
| Al elegir la categoría | Proponía su área | Los conceptos de obra piden **elegir la obra** (si solo hay una activa, queda elegida); los de soporte van a su área. |
| Roles sugeridos | Dueño, Administración, Médico veterinario, Recepción | **Dueño**, **Administración**, **Compras** (registra y paga compras de todas las obras y revisa comprobantes; sin nómina, saldos, resultado ni mover dinero) y **Residente de obra** (solo captura desde el celular y ve lo suyo). Para que un residente vea su obra completa: duplica el rol y elige la obra en «Obras y áreas de su alcance». |
| Nota de voz | Vocabulario de clínica | Vocabulario de obra (estimaciones, raya, materiales); propone la obra por nombre, lugar, cliente o clave, y nunca la adivina. |
| Marca | Verde pino y menta | Azul marino `#13294b`, negro, grises y fondo blanco. Logotipo **provisional** recreado de la papelería (tres trazos y ELGO). |

Todo lo demás es igual: cobros y pagos parciales, comprobantes privados, corrección y anulación con bitácora, nómina restringida, saldos, traspasos, fondos a cargo de empleados (útil para el dinero que maneja cada residente), gastos «de mi bolsa» con reembolso, sesiones de 7 días y «Si se pierde un teléfono».

## 2. Piezas y variables

| Pieza | Dónde | Variable en Vercel |
|---|---|---|
| App | Vercel, proyecto `elgo-finanzas` (equipo Jano's Portfolio), rama `main` = producción. URL: https://elgo-finanzas.vercel.app | — |
| Código | GitHub `JanoM91/ELGO-Constructora` (público: nunca subir datos ni secretos) | — |
| Base de datos | Supabase `elgo-finanzas` (ref `thmpxlacrftqynwnctmu`, us-east-2), organización Exkalibur Consulting | `DATABASE_URL` (Sensitive, solo Production) |
| Secreto de sesiones | — | `PAYLOAD_SECRET` (Sensitive), nuevo: `openssl rand -hex 32` |
| Comprobantes | Vercel Blob **privado** `elgo-finanzas-comprobantes` (`store_wyxad23rDNz8wdAX`), conectado con prefijo `FINANZAS_BLOB` | `FINANZAS_BLOB_READ_WRITE_TOKEN` |
| Nota de voz | Anthropic (Claude) | `ANTHROPIC_API_KEY` (Sensitive), llave propia de ELGO con límite de gasto; opcional `ANTHROPIC_MODEL` |
| Correo «Olvidé mi contraseña» | Resend | `RESEND_API_KEY`, `LEADS_FROM_EMAIL` (opcionales) |
| Identidad | — | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME=ELGO`, `NEXT_PUBLIC_LOCATION_CITY=Xalapa`, `NEXT_PUBLIC_LOCATION_TIMEZONE=America/Mexico_City` |

Acordado con ELGO (12-oct-2026): ELGO paga los costos de operación (Supabase, Vercel, dominio, IA).

## 3. Base de datos en Supabase

Proyecto `elgo-finanzas` (ref `thmpxlacrftqynwnctmu`, us-east-2), creado el 12-oct-2026. La app entra por `aws-0-us-east-2.pooler.supabase.com:6543` (modo transacción) con el usuario `payload_app.thmpxlacrftqynwnctmu`. Igual que Orthopedic Vet's: rol propio `payload_app` dueño de las tablas, pooler en modo transacción, tablas en `public` con **RLS activado y sin políticas** (la API REST de Supabase no lee nada; el asesor de Supabase marcará «RLS Enabled No Policy», es intencional). Migraciones en `migrations/`: `20261012_145835_inicial` (esquema completo) y `20261012_145900_rls_supabase`. Se aplican solas al arrancar en producción.

## 4. Arranque (una sola vez)

1. Abrir la URL de producción → «Crear primer usuario»: esa cuenta queda como **superadministrador**.
2. Finanzas → Configuración → **Crear las sugeridas** (categorías y áreas).
3. **Agregar obra** por cada obra en curso (nombre corto, cliente, sector, importe contratado con IVA si se conoce).
4. **Crear los sugeridos** (roles) → cuentas y cajas (bancos, efectivo, caja chica y un fondo por residente que maneje dinero) con su saldo a la fecha de corte → fecha de corte.
5. Panel → Sistema → **Usuarios**: crear a cada persona con su rol.
6. Cada persona abre la URL en su teléfono y la agrega a la pantalla de inicio.

## 5. Verificación de la entrega (12-oct-2026, en local)

| Prueba | Resultado |
|---|---|
| `tsc --noEmit`, `npm run lint`, `npm run build` | Sin errores |
| `npm run test:finanzas` | 45 / 45 |
| Arranque en modo producción contra Postgres local vacío | Aplicó las 2 migraciones solo |
| Integración por API contra Postgres local | 44 / 44: primer usuario superadmin; 3 áreas y 29 categorías; 4 roles; obras pública y privada; anticipo, estimación con cobro parcial, materiales, subcontrato por pagar, renta de maquinaria, nómina; resultado por obra al centavo (entradas, cobrado, por cobrar, gastos, pagado, por pagar, resultado, flujo, contrato); anulado no cuenta; filtro por obra y obras terminadas; obra terminada sale del registro; Residente (gasto de su bolsa, sin nómina, sin Obras, sin saldos, solo lo suyo); Compras (todas las obras sin nómina, paga el subcontrato, sin Obras); cuenta sin rol rechazada; API genérica `fin-*` cerrada; saldo del banco al centavo; nota de voz sin llave → 503 |
| Pantallas (Chromium) | Login 390 px, Obras 390 y 1280 px, inicio 1280 px, inicio y captura del residente 390 px, alta de obra 1280 px; sin errores de JavaScript |

No probado aquí: Supabase real, subida de comprobantes (necesita el almacén privado), nota de voz con llave real y dictado en teléfonos reales, correo de recuperación.

## 6. Pendiente

- **Producción (12-oct-2026)**: publicada en https://elgo-finanzas.vercel.app; las 2 migraciones se aplicaron solas (18 tablas, todas con RLS, dueño `payload_app`). Falta `FINANZAS_BLOB_READ_WRITE_TOKEN` (el almacén se conectó sin él) y `ANTHROPIC_API_KEY`.
- **Logotipo oficial** en vector: reemplazar `public/logo-*.png` y volver a correr `scripts/iconos-finanzas/generar-iconos.py`.
- **Multiempresa**: en la sesión de definición se acordó separar empresas desde el día 1. Esta réplica sigue el modelo de Orthopedic Vet's (una instalación por empresa, con base propia), que aísla bien los datos pero no comparte una sola base. Decidir antes de vender a otra constructora.
- **Obra pública a detalle** (siguiente iteración): estimaciones con amortización de anticipo, retenciones (5 al millar, fondo de garantía) y facturas CFDI ligadas al cobro. Hoy una estimación se registra por su importe neto cobrado.
- Validar con ELGO: catálogo de categorías, si «Raya y destajos de obra» debe ser restringida, y quién recibe material y registra pagos.
