# Operación — ELGO Inventario

> Segunda aplicación de ELGO (19 de octubre de 2026). Vive en el mismo proyecto que Finanzas, en `/admin/inventario`. El diseño completo (fases A–F) está en el prompt maestro `elgo-inventario-prompt-maestro-v0.1` del proyecto de Claude. Aquí va lo que ya existe (fase A) y cómo se opera.

## 1. Qué hace hoy (fase A)

| Pantalla | Qué hace | Quién |
|---|---|---|
| Inicio | Accesos: buscar material, entrada, salida a obra, existencias. Avisa qué falta configurar. | Todo rol con Inventario |
| Catálogo | Busca materiales por descripción, clave (MAT-000123), marca o número de parte; filtra por familia. Alta rápida de material. | Buscar: todos. Alta: Compras (confirmar) y quien configura |
| Material | Ficha: atributos, existencia por ubicación, último precio (cuando haya), últimos movimientos. «Editar en el panel» para cambios completos. | Todos; precios solo con «Ver precios» |
| Existencias | Qué hay por ubicación (bodega, cada obra, vehículos). Marca «por recuperar» lo que queda en una obra desactivada. | Todos, dentro de su alcance |
| Registrar | Entrada por compra, salida a obra, traspaso, devolución, ajuste por conteo, merma, existencia inicial. Reintentar no duplica. | «Registrar movimientos» |
| Movimientos | Lista con filtro por ubicación; anular con motivo. | Todos; anular: quien lo registró, Compras o quien configura |
| Configuración | Arranque: proveedores, familias y ubicaciones sugeridas; parámetros; roles. | «Configurar Inventario» |

**Las existencias no se editan:** son la suma de los movimientos (`lib/inventario/reglas.ts`, `existenciasDesdeMovimientos`). Si el conteo físico no coincide, se registra un ajuste con motivo.

## 2. Arranque (una sola vez)

1. En **Roles** (Sistema → Roles) marca las casillas del grupo «Inventario» de cada rol. Sugerencia: Dueño todo; **Compras**: confirmar, requisiciones, movimientos, obras «Todas»; **Administración**: documentos y confirmar; **Residente de obra**: requisiciones y movimientos con obras «Solo las de su alcance en Finanzas». Un rol guardado antes del módulo no usa Inventario hasta que se le marque algo.
2. Entra a `/admin/inventario/configuracion` y presiona, en orden: **Crear los sugeridos** (proveedores: Eléctrico, M&M, Sistelec, Cárdenas, Referencia web), **Crear las sugeridas** (11 familias con subfamilias) y **Crear bodega y obras** (Bodega ELGO + una ubicación por obra activa de Finanzas). El tercero se puede repetir cuando se den de alta obras nuevas: solo crea las que falten.
3. Completa en el panel (grupo «Inventario») contactos y clave de cliente de cada proveedor, y revisa parámetros en **Configuración de Inventario**: IVA 16 %, alerta de precio 5 %, precio viejo a 45 días, confianza de empate 0.85, proveedor preferido.
4. Si hay material en bodega antes de arrancar, regístralo con **Existencia inicial** (tipo «apertura»).

## 3. Alcance por obra

Un rol con obras «Solo las de su alcance» ve y mueve material únicamente de la bodega, vehículos, tránsito y las obras marcadas en Finanzas → «Obras y áreas de su alcance». El filtro se aplica en la consulta (servicio), no en la pantalla: una ubicación fuera de alcance responde «no está en tu alcance» aunque se mande por la API.

## 4. Técnico

- Colecciones `inv-*` en `collections/inventario/`: catálogos (`inv-proveedores`, `inv-familias`, `inv-materiales`, `inv-equivalencias`, `inv-ubicaciones`, global `inv-configuracion`) editables en el panel; registros (`inv-documentos`, `inv-partidas`, `inv-precios`, `inv-movimientos`, `inv-bitacora`) solo por el servicio: responden 403 en `/api/inv-…` incluso al superadministrador.
- Servicio: `lib/inventario/servicio.ts`, expuesto en `app/api/inventario/[...ruta]/route.ts` (rutas en el encabezado del archivo). Reglas puras en `lib/inventario/reglas.ts`; tipos de la API en `lib/inventario/tipos.ts`.
- Permisos: grupo `inventario` en `roles`; `PermisosInventario` en `lib/permisosBase.ts` (`confirmar` incluye `documentos` y `verPrecios`; `configurar` incluye todo). `esSoloCaptura` ahora también manda directo a Inventario a quien solo usa Inventario.
- Migración `20261019_151532_inventario_base` (14 tablas, todas con RLS activado al final del `up`). Se aplica sola al desplegar.
- Pruebas sin base: `npm run test:inventario` (41 casos: unidades y factores, normalización PG/PD y pulgadas, empate por parecido, existencias, variación y pronóstico de precios, permisos). También en CI.
- Pantallas en `components/admin/inventario/` reutilizando los estilos y piezas de Finanzas (`fz-*`, `comun.tsx` de Finanzas). Probadas a 320, 390 y 1280 px.
- Precios: en la base en pesos sin IVA por unidad base; en el servicio y la API, centavos enteros (`...Centavos`).

## 5. Importar lotes de cotizaciones (19-oct-2026)

Puente hasta la fase B. Claude lee los PDF de las tiendas fuera de la app y arma un **lote** (`.json`, fuera del repositorio: los datos de ELGO son confidenciales) con materiales propuestos, equivalencias (clave de la tienda → material) y documentos con sus partidas ya empatadas.

**Cómo se sube:** Inventario → Configuración → «5 · Importar lote de cotizaciones» → elegir el archivo. La pantalla manda primero el catálogo y luego los documentos en tandas de 4 (cada tanda en su propia transacción, `maxDuration` 300 s); al final pide el resumen de alertas. Si algo falla, lo que entró se queda y basta con volver a subir el mismo archivo: lo ya importado se omite. Permiso: «Configurar Inventario».

**Reglas** (`lib/inventario/importacion.ts`): un material se reconoce por su equivalencia (proveedor + clave + texto) o por marca + número de parte; un documento por proveedor + folio + versión + archivo. Solo las partidas con `aportaPrecio` escriben en `inv-precios`. Al final se recalculan, por material y proveedor, la variación contra el precio anterior (alerta arriba del umbral), el último precio y el precio de referencia.

**Versiones de un mismo folio** (decisión de Jano): archivos idénticos se guardan una vez; si hay versión marcada «OK», esa manda; si no, solo entran al histórico los precios que no se contradicen entre versiones, y las partidas en conflicto quedan con la observación `precio_entre_versiones`.

**Desde la terminal** (base local para probar): `npx payload run scripts/importarLote.ts -- lote.json [correo]`. Todo en una transacción.

**Lote 1** (19-oct-2026): 37 PDF de Eléctrico (36 cotizaciones y la factura XF 41400, ago–oct 2026) → 231 materiales, 232 equivalencias, 35 documentos, 845 partidas, 431 precios, 17 alertas. Unidades nuevas `paquete` y `cubeta` (migración `20261019_180537_unidades_paquete_cubeta`).

## 6. Lo que sigue (fases B–F del prompt maestro)

B: subir cotización/requisición/factura (PDF, foto, Excel) → Claude extrae partidas → empate con el catálogo (número de parte, clave de proveedor, equivalencia previa, descripción) → revisión humana → confirmar: escribe `inv-precios` y `inv-equivalencias`. C: cuadro comparativo por requisición, alertas de variación por proveedor, concentración del gasto. D: requisiciones con pronóstico y cobertura. E: entrada desde documento con foto, sugerencia de surtir de bodega. F: cierre y documentación.

Ya quedaron listos para esas fases: las colecciones de documentos, partidas y precios; los campos `ultimoPrecio` y `precioReferencia` en materiales; `precioEstimado`, `resumenPronostico`, `variacionPct`, `concentracion`, `mejoresCandidatos` y `cuadraSubtotal` en reglas; y el permiso `documentos`/`confirmar`.
