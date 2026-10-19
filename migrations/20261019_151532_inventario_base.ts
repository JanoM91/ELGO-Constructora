import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roles_inventario_obras" AS ENUM('alcance', 'todas');
  CREATE TYPE "public"."enum_inv_proveedores_tipo" AS ENUM('tienda', 'distribuidor', 'fabricante', 'web');
  CREATE TYPE "public"."enum_inv_proveedores_prioridad" AS ENUM('primera', 'segunda', 'foraneo', 'referencia');
  CREATE TYPE "public"."enum_inv_materiales_unidad_base" AS ENUM('pieza', 'metro', 'kilogramo', 'tramo', 'rollo', 'caja', 'lote', 'juego', 'litro', 'bolsa', 'par');
  CREATE TYPE "public"."enum_inv_materiales_atributos_pared" AS ENUM('pg', 'pd', 'na');
  CREATE TYPE "public"."enum_inv_ubicaciones_tipo" AS ENUM('bodega', 'obra', 'vehiculo', 'transito');
  CREATE TYPE "public"."enum_inv_documentos_tipo" AS ENUM('cotizacion', 'requisicion', 'factura', 'presupuesto', 'referencia_web');
  CREATE TYPE "public"."enum_inv_documentos_estado" AS ENUM('por_revisar', 'confirmado', 'anulado');
  CREATE TYPE "public"."enum_inv_documentos_estado_requisicion" AS ENUM('borrador', 'enviada', 'cotizada', 'aprobada', 'comprada', 'cerrada');
  CREATE TYPE "public"."enum_inv_documentos_prioridad" AS ENUM('planeada', 'urgente');
  CREATE TYPE "public"."enum_inv_documentos_origen" AS ENUM('manual', 'lectura', 'importacion');
  CREATE TYPE "public"."enum_inv_partidas_metodo_empate" AS ENUM('numero_parte', 'clave_proveedor', 'equivalencia', 'descripcion', 'manual');
  CREATE TYPE "public"."enum_inv_partidas_estado_empate" AS ENUM('propuesto', 'confirmado', 'sin_material', 'descartada');
  CREATE TYPE "public"."enum_inv_precios_fuente" AS ENUM('cotizacion', 'factura', 'web', 'manual');
  CREATE TYPE "public"."enum_inv_movimientos_tipo" AS ENUM('entrada_compra', 'salida_obra', 'traspaso', 'devolucion', 'ajuste', 'merma', 'apertura');
  CREATE TYPE "public"."enum_inv_bitacora_accion" AS ENUM('crear', 'subir', 'empatar', 'confirmar', 'anular', 'movimiento', 'corregir', 'arranque');
  CREATE TABLE "inv_proveedores_contactos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"whatsapp" varchar,
  	"correo" varchar
  );
  
  CREATE TABLE "inv_proveedores" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"nombre_corto" varchar NOT NULL,
  	"tipo" "enum_inv_proveedores_tipo" DEFAULT 'tienda' NOT NULL,
  	"prioridad" "enum_inv_proveedores_prioridad" DEFAULT 'primera' NOT NULL,
  	"ciudad" varchar DEFAULT 'Xalapa',
  	"clave_cliente" varchar,
  	"condiciones_vigencia_dias" numeric DEFAULT 15,
  	"condiciones_descuento_sobre_lista" numeric,
  	"condiciones_maneja_saldo_a_favor" boolean DEFAULT false,
  	"sitio_web" varchar,
  	"activo" boolean DEFAULT true,
  	"notas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_familias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"padre_id" integer,
  	"orden" numeric DEFAULT 0,
  	"activa" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_materiales" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"clave" varchar,
  	"familia_id" integer,
  	"descripcion" varchar NOT NULL,
  	"marca" varchar,
  	"numero_parte" varchar,
  	"unidad_base" "enum_inv_materiales_unidad_base" DEFAULT 'pieza' NOT NULL,
  	"critico" boolean DEFAULT false,
  	"atributos_medida" varchar,
  	"atributos_calibre" varchar,
  	"atributos_color" varchar,
  	"atributos_pared" "enum_inv_materiales_atributos_pared",
  	"atributos_longitud_tramo" numeric,
  	"atributos_peso_por_metro_kg" numeric,
  	"atributos_amperes" numeric,
  	"atributos_polos" numeric,
  	"atributos_tension" varchar,
  	"atributos_acabado" varchar,
  	"ultimo_precio_precio_base" numeric,
  	"ultimo_precio_proveedor_id" integer,
  	"ultimo_precio_fecha" varchar,
  	"precio_referencia" numeric,
  	"fecha_ultimo_movimiento" varchar,
  	"texto_busqueda" varchar,
  	"activo" boolean DEFAULT true,
  	"notas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_equivalencias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"texto_original" varchar NOT NULL,
  	"proveedor_id" integer,
  	"clave_proveedor" varchar,
  	"material_id" integer NOT NULL,
  	"unidad_original" varchar NOT NULL,
  	"factor" numeric DEFAULT 1 NOT NULL,
  	"confirmada_por_id" integer,
  	"confirmada_en" varchar,
  	"documento_origen_id" integer,
  	"texto_normalizado" varchar,
  	"activa" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_ubicaciones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"tipo" "enum_inv_ubicaciones_tipo" DEFAULT 'bodega' NOT NULL,
  	"obra_id" integer,
  	"responsable_id" integer,
  	"activa" boolean DEFAULT true,
  	"notas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_documentos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tipo" "enum_inv_documentos_tipo" NOT NULL,
  	"estado" "enum_inv_documentos_estado" DEFAULT 'por_revisar' NOT NULL,
  	"proveedor_id" integer,
  	"obra_id" integer,
  	"folio" varchar,
  	"titulo" varchar,
  	"fecha_documento" varchar,
  	"vigencia_hasta" varchar,
  	"version" numeric DEFAULT 1 NOT NULL,
  	"documento_padre_id" integer,
  	"archivo_ruta" varchar,
  	"archivo_nombre" varchar,
  	"archivo_tipo" varchar,
  	"archivo_tamano" numeric,
  	"subtotal" numeric,
  	"iva" numeric,
  	"total" numeric,
  	"cuadra" boolean DEFAULT true,
  	"estado_requisicion" "enum_inv_documentos_estado_requisicion",
  	"prioridad" "enum_inv_documentos_prioridad",
  	"necesaria_para" varchar,
  	"solicitante_id" integer,
  	"origen" "enum_inv_documentos_origen" DEFAULT 'manual',
  	"lectura_notas" varchar,
  	"subido_por_id" integer NOT NULL,
  	"confirmado_por_id" integer,
  	"confirmado_en" timestamp(3) with time zone,
  	"anulado_por_id" integer,
  	"anulado_en" timestamp(3) with time zone,
  	"motivo_anulacion" varchar,
  	"notas" varchar,
  	"clave_idempotencia" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_partidas_observaciones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tipo" varchar NOT NULL,
  	"texto" varchar NOT NULL
  );
  
  CREATE TABLE "inv_partidas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"documento_id" integer NOT NULL,
  	"linea" numeric NOT NULL,
  	"grupo" varchar,
  	"texto_original" varchar NOT NULL,
  	"cantidad_original" numeric,
  	"unidad_original" varchar,
  	"precio_unitario_original" numeric,
  	"importe_original" numeric,
  	"marca_original" varchar,
  	"clave_proveedor" varchar,
  	"incluye_iva" boolean DEFAULT false,
  	"material_id" integer,
  	"metodo_empate" "enum_inv_partidas_metodo_empate",
  	"confianza_empate" numeric,
  	"estado_empate" "enum_inv_partidas_estado_empate" DEFAULT 'propuesto' NOT NULL,
  	"material_propuesto_id" integer,
  	"factor" numeric DEFAULT 1,
  	"cantidad_base" numeric,
  	"precio_unitario_base" numeric,
  	"importe_base" numeric,
  	"precio_pronosticado" numeric,
  	"fuente_pronostico" varchar,
  	"variacion_pct" numeric,
  	"alerta_precio" boolean DEFAULT false,
  	"revisada_por_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_precios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"material_id" integer NOT NULL,
  	"proveedor_id" integer NOT NULL,
  	"fecha" varchar NOT NULL,
  	"vigencia_hasta" varchar,
  	"precio_base" numeric NOT NULL,
  	"unidad_base" varchar NOT NULL,
  	"fuente" "enum_inv_precios_fuente" NOT NULL,
  	"documento_id" integer,
  	"partida_id" integer,
  	"url" varchar,
  	"anulado" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_movimientos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tipo" "enum_inv_movimientos_tipo" NOT NULL,
  	"material_id" integer NOT NULL,
  	"cantidad" numeric NOT NULL,
  	"origen_id" integer,
  	"destino_id" integer,
  	"obra_id" integer,
  	"fecha" varchar NOT NULL,
  	"documento_id" integer,
  	"partida_id" integer,
  	"costo_unitario_base" numeric,
  	"foto_ruta" varchar,
  	"motivo" varchar,
  	"registrado_por_id" integer NOT NULL,
  	"anulado" boolean DEFAULT false,
  	"motivo_anulacion" varchar,
  	"clave_idempotencia" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_bitacora" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"coleccion" varchar NOT NULL,
  	"registro" numeric,
  	"documento_id" integer,
  	"accion" "enum_inv_bitacora_accion" NOT NULL,
  	"campo" varchar,
  	"valor_anterior" varchar,
  	"valor_nuevo" varchar,
  	"motivo" varchar,
  	"usuario_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inv_configuracion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tasa_iva" numeric DEFAULT 16 NOT NULL,
  	"umbral_alerta_precio" numeric DEFAULT 5 NOT NULL,
  	"dias_precio_viejo" numeric DEFAULT 45 NOT NULL,
  	"umbral_confianza_empate" numeric DEFAULT 0.85 NOT NULL,
  	"proveedor_preferido_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "inv_configuracion_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  ALTER TABLE "roles" ADD COLUMN "inventario_usar" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "inventario_documentos" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "inventario_confirmar" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "inventario_ver_precios" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "inventario_requisiciones" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "inventario_movimientos" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "inventario_configurar" boolean DEFAULT false;
  ALTER TABLE "roles" ADD COLUMN "inventario_obras" "enum_roles_inventario_obras" DEFAULT 'alcance';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_proveedores_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_familias_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_materiales_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_equivalencias_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_ubicaciones_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_documentos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_partidas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_precios_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_movimientos_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inv_bitacora_id" integer;
  ALTER TABLE "inv_proveedores_contactos" ADD CONSTRAINT "inv_proveedores_contactos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."inv_proveedores"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inv_familias" ADD CONSTRAINT "inv_familias_padre_id_inv_familias_id_fk" FOREIGN KEY ("padre_id") REFERENCES "public"."inv_familias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_materiales" ADD CONSTRAINT "inv_materiales_familia_id_inv_familias_id_fk" FOREIGN KEY ("familia_id") REFERENCES "public"."inv_familias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_materiales" ADD CONSTRAINT "inv_materiales_ultimo_precio_proveedor_id_inv_proveedores_id_fk" FOREIGN KEY ("ultimo_precio_proveedor_id") REFERENCES "public"."inv_proveedores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_equivalencias" ADD CONSTRAINT "inv_equivalencias_proveedor_id_inv_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."inv_proveedores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_equivalencias" ADD CONSTRAINT "inv_equivalencias_material_id_inv_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."inv_materiales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_equivalencias" ADD CONSTRAINT "inv_equivalencias_confirmada_por_id_users_id_fk" FOREIGN KEY ("confirmada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_equivalencias" ADD CONSTRAINT "inv_equivalencias_documento_origen_id_inv_documentos_id_fk" FOREIGN KEY ("documento_origen_id") REFERENCES "public"."inv_documentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_ubicaciones" ADD CONSTRAINT "inv_ubicaciones_obra_id_fin_actividades_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."fin_actividades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_ubicaciones" ADD CONSTRAINT "inv_ubicaciones_responsable_id_users_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_documentos" ADD CONSTRAINT "inv_documentos_proveedor_id_inv_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."inv_proveedores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_documentos" ADD CONSTRAINT "inv_documentos_obra_id_fin_actividades_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."fin_actividades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_documentos" ADD CONSTRAINT "inv_documentos_documento_padre_id_inv_documentos_id_fk" FOREIGN KEY ("documento_padre_id") REFERENCES "public"."inv_documentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_documentos" ADD CONSTRAINT "inv_documentos_solicitante_id_users_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_documentos" ADD CONSTRAINT "inv_documentos_subido_por_id_users_id_fk" FOREIGN KEY ("subido_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_documentos" ADD CONSTRAINT "inv_documentos_confirmado_por_id_users_id_fk" FOREIGN KEY ("confirmado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_documentos" ADD CONSTRAINT "inv_documentos_anulado_por_id_users_id_fk" FOREIGN KEY ("anulado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_partidas_observaciones" ADD CONSTRAINT "inv_partidas_observaciones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."inv_partidas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inv_partidas" ADD CONSTRAINT "inv_partidas_documento_id_inv_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."inv_documentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_partidas" ADD CONSTRAINT "inv_partidas_material_id_inv_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."inv_materiales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_partidas" ADD CONSTRAINT "inv_partidas_material_propuesto_id_inv_materiales_id_fk" FOREIGN KEY ("material_propuesto_id") REFERENCES "public"."inv_materiales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_partidas" ADD CONSTRAINT "inv_partidas_revisada_por_id_users_id_fk" FOREIGN KEY ("revisada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_precios" ADD CONSTRAINT "inv_precios_material_id_inv_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."inv_materiales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_precios" ADD CONSTRAINT "inv_precios_proveedor_id_inv_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."inv_proveedores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_precios" ADD CONSTRAINT "inv_precios_documento_id_inv_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."inv_documentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_precios" ADD CONSTRAINT "inv_precios_partida_id_inv_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."inv_partidas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_movimientos" ADD CONSTRAINT "inv_movimientos_material_id_inv_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."inv_materiales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_movimientos" ADD CONSTRAINT "inv_movimientos_origen_id_inv_ubicaciones_id_fk" FOREIGN KEY ("origen_id") REFERENCES "public"."inv_ubicaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_movimientos" ADD CONSTRAINT "inv_movimientos_destino_id_inv_ubicaciones_id_fk" FOREIGN KEY ("destino_id") REFERENCES "public"."inv_ubicaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_movimientos" ADD CONSTRAINT "inv_movimientos_obra_id_fin_actividades_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."fin_actividades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_movimientos" ADD CONSTRAINT "inv_movimientos_documento_id_inv_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."inv_documentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_movimientos" ADD CONSTRAINT "inv_movimientos_partida_id_inv_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."inv_partidas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_movimientos" ADD CONSTRAINT "inv_movimientos_registrado_por_id_users_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_bitacora" ADD CONSTRAINT "inv_bitacora_documento_id_inv_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."inv_documentos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_bitacora" ADD CONSTRAINT "inv_bitacora_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_configuracion" ADD CONSTRAINT "inv_configuracion_proveedor_preferido_id_inv_proveedores_id_fk" FOREIGN KEY ("proveedor_preferido_id") REFERENCES "public"."inv_proveedores"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inv_configuracion_rels" ADD CONSTRAINT "inv_configuracion_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."inv_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inv_configuracion_rels" ADD CONSTRAINT "inv_configuracion_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "inv_proveedores_contactos_order_idx" ON "inv_proveedores_contactos" USING btree ("_order");
  CREATE INDEX "inv_proveedores_contactos_parent_id_idx" ON "inv_proveedores_contactos" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "inv_proveedores_nombre_idx" ON "inv_proveedores" USING btree ("nombre");
  CREATE INDEX "inv_proveedores_updated_at_idx" ON "inv_proveedores" USING btree ("updated_at");
  CREATE INDEX "inv_proveedores_created_at_idx" ON "inv_proveedores" USING btree ("created_at");
  CREATE INDEX "inv_familias_padre_idx" ON "inv_familias" USING btree ("padre_id");
  CREATE INDEX "inv_familias_updated_at_idx" ON "inv_familias" USING btree ("updated_at");
  CREATE INDEX "inv_familias_created_at_idx" ON "inv_familias" USING btree ("created_at");
  CREATE UNIQUE INDEX "inv_materiales_clave_idx" ON "inv_materiales" USING btree ("clave");
  CREATE INDEX "inv_materiales_familia_idx" ON "inv_materiales" USING btree ("familia_id");
  CREATE INDEX "inv_materiales_marca_idx" ON "inv_materiales" USING btree ("marca");
  CREATE INDEX "inv_materiales_numero_parte_idx" ON "inv_materiales" USING btree ("numero_parte");
  CREATE INDEX "inv_materiales_ultimo_precio_ultimo_precio_proveedor_idx" ON "inv_materiales" USING btree ("ultimo_precio_proveedor_id");
  CREATE INDEX "inv_materiales_texto_busqueda_idx" ON "inv_materiales" USING btree ("texto_busqueda");
  CREATE INDEX "inv_materiales_updated_at_idx" ON "inv_materiales" USING btree ("updated_at");
  CREATE INDEX "inv_materiales_created_at_idx" ON "inv_materiales" USING btree ("created_at");
  CREATE INDEX "inv_equivalencias_proveedor_idx" ON "inv_equivalencias" USING btree ("proveedor_id");
  CREATE INDEX "inv_equivalencias_clave_proveedor_idx" ON "inv_equivalencias" USING btree ("clave_proveedor");
  CREATE INDEX "inv_equivalencias_material_idx" ON "inv_equivalencias" USING btree ("material_id");
  CREATE INDEX "inv_equivalencias_confirmada_por_idx" ON "inv_equivalencias" USING btree ("confirmada_por_id");
  CREATE INDEX "inv_equivalencias_documento_origen_idx" ON "inv_equivalencias" USING btree ("documento_origen_id");
  CREATE INDEX "inv_equivalencias_texto_normalizado_idx" ON "inv_equivalencias" USING btree ("texto_normalizado");
  CREATE INDEX "inv_equivalencias_updated_at_idx" ON "inv_equivalencias" USING btree ("updated_at");
  CREATE INDEX "inv_equivalencias_created_at_idx" ON "inv_equivalencias" USING btree ("created_at");
  CREATE UNIQUE INDEX "inv_ubicaciones_nombre_idx" ON "inv_ubicaciones" USING btree ("nombre");
  CREATE INDEX "inv_ubicaciones_obra_idx" ON "inv_ubicaciones" USING btree ("obra_id");
  CREATE INDEX "inv_ubicaciones_responsable_idx" ON "inv_ubicaciones" USING btree ("responsable_id");
  CREATE INDEX "inv_ubicaciones_updated_at_idx" ON "inv_ubicaciones" USING btree ("updated_at");
  CREATE INDEX "inv_ubicaciones_created_at_idx" ON "inv_ubicaciones" USING btree ("created_at");
  CREATE INDEX "inv_documentos_tipo_idx" ON "inv_documentos" USING btree ("tipo");
  CREATE INDEX "inv_documentos_estado_idx" ON "inv_documentos" USING btree ("estado");
  CREATE INDEX "inv_documentos_proveedor_idx" ON "inv_documentos" USING btree ("proveedor_id");
  CREATE INDEX "inv_documentos_obra_idx" ON "inv_documentos" USING btree ("obra_id");
  CREATE INDEX "inv_documentos_folio_idx" ON "inv_documentos" USING btree ("folio");
  CREATE INDEX "inv_documentos_fecha_documento_idx" ON "inv_documentos" USING btree ("fecha_documento");
  CREATE INDEX "inv_documentos_documento_padre_idx" ON "inv_documentos" USING btree ("documento_padre_id");
  CREATE INDEX "inv_documentos_estado_requisicion_idx" ON "inv_documentos" USING btree ("estado_requisicion");
  CREATE INDEX "inv_documentos_solicitante_idx" ON "inv_documentos" USING btree ("solicitante_id");
  CREATE INDEX "inv_documentos_subido_por_idx" ON "inv_documentos" USING btree ("subido_por_id");
  CREATE INDEX "inv_documentos_confirmado_por_idx" ON "inv_documentos" USING btree ("confirmado_por_id");
  CREATE INDEX "inv_documentos_anulado_por_idx" ON "inv_documentos" USING btree ("anulado_por_id");
  CREATE UNIQUE INDEX "inv_documentos_clave_idempotencia_idx" ON "inv_documentos" USING btree ("clave_idempotencia");
  CREATE INDEX "inv_documentos_updated_at_idx" ON "inv_documentos" USING btree ("updated_at");
  CREATE INDEX "inv_documentos_created_at_idx" ON "inv_documentos" USING btree ("created_at");
  CREATE INDEX "inv_partidas_observaciones_order_idx" ON "inv_partidas_observaciones" USING btree ("_order");
  CREATE INDEX "inv_partidas_observaciones_parent_id_idx" ON "inv_partidas_observaciones" USING btree ("_parent_id");
  CREATE INDEX "inv_partidas_documento_idx" ON "inv_partidas" USING btree ("documento_id");
  CREATE INDEX "inv_partidas_clave_proveedor_idx" ON "inv_partidas" USING btree ("clave_proveedor");
  CREATE INDEX "inv_partidas_material_idx" ON "inv_partidas" USING btree ("material_id");
  CREATE INDEX "inv_partidas_estado_empate_idx" ON "inv_partidas" USING btree ("estado_empate");
  CREATE INDEX "inv_partidas_material_propuesto_idx" ON "inv_partidas" USING btree ("material_propuesto_id");
  CREATE INDEX "inv_partidas_alerta_precio_idx" ON "inv_partidas" USING btree ("alerta_precio");
  CREATE INDEX "inv_partidas_revisada_por_idx" ON "inv_partidas" USING btree ("revisada_por_id");
  CREATE INDEX "inv_partidas_updated_at_idx" ON "inv_partidas" USING btree ("updated_at");
  CREATE INDEX "inv_partidas_created_at_idx" ON "inv_partidas" USING btree ("created_at");
  CREATE INDEX "inv_precios_material_idx" ON "inv_precios" USING btree ("material_id");
  CREATE INDEX "inv_precios_proveedor_idx" ON "inv_precios" USING btree ("proveedor_id");
  CREATE INDEX "inv_precios_fecha_idx" ON "inv_precios" USING btree ("fecha");
  CREATE INDEX "inv_precios_documento_idx" ON "inv_precios" USING btree ("documento_id");
  CREATE INDEX "inv_precios_partida_idx" ON "inv_precios" USING btree ("partida_id");
  CREATE INDEX "inv_precios_anulado_idx" ON "inv_precios" USING btree ("anulado");
  CREATE INDEX "inv_precios_updated_at_idx" ON "inv_precios" USING btree ("updated_at");
  CREATE INDEX "inv_precios_created_at_idx" ON "inv_precios" USING btree ("created_at");
  CREATE INDEX "inv_movimientos_tipo_idx" ON "inv_movimientos" USING btree ("tipo");
  CREATE INDEX "inv_movimientos_material_idx" ON "inv_movimientos" USING btree ("material_id");
  CREATE INDEX "inv_movimientos_origen_idx" ON "inv_movimientos" USING btree ("origen_id");
  CREATE INDEX "inv_movimientos_destino_idx" ON "inv_movimientos" USING btree ("destino_id");
  CREATE INDEX "inv_movimientos_obra_idx" ON "inv_movimientos" USING btree ("obra_id");
  CREATE INDEX "inv_movimientos_fecha_idx" ON "inv_movimientos" USING btree ("fecha");
  CREATE INDEX "inv_movimientos_documento_idx" ON "inv_movimientos" USING btree ("documento_id");
  CREATE INDEX "inv_movimientos_partida_idx" ON "inv_movimientos" USING btree ("partida_id");
  CREATE INDEX "inv_movimientos_registrado_por_idx" ON "inv_movimientos" USING btree ("registrado_por_id");
  CREATE INDEX "inv_movimientos_anulado_idx" ON "inv_movimientos" USING btree ("anulado");
  CREATE UNIQUE INDEX "inv_movimientos_clave_idempotencia_idx" ON "inv_movimientos" USING btree ("clave_idempotencia");
  CREATE INDEX "inv_movimientos_updated_at_idx" ON "inv_movimientos" USING btree ("updated_at");
  CREATE INDEX "inv_movimientos_created_at_idx" ON "inv_movimientos" USING btree ("created_at");
  CREATE INDEX "inv_bitacora_coleccion_idx" ON "inv_bitacora" USING btree ("coleccion");
  CREATE INDEX "inv_bitacora_registro_idx" ON "inv_bitacora" USING btree ("registro");
  CREATE INDEX "inv_bitacora_documento_idx" ON "inv_bitacora" USING btree ("documento_id");
  CREATE INDEX "inv_bitacora_usuario_idx" ON "inv_bitacora" USING btree ("usuario_id");
  CREATE INDEX "inv_bitacora_updated_at_idx" ON "inv_bitacora" USING btree ("updated_at");
  CREATE INDEX "inv_bitacora_created_at_idx" ON "inv_bitacora" USING btree ("created_at");
  CREATE INDEX "inv_configuracion_proveedor_preferido_idx" ON "inv_configuracion" USING btree ("proveedor_preferido_id");
  CREATE INDEX "inv_configuracion_rels_order_idx" ON "inv_configuracion_rels" USING btree ("order");
  CREATE INDEX "inv_configuracion_rels_parent_idx" ON "inv_configuracion_rels" USING btree ("parent_id");
  CREATE INDEX "inv_configuracion_rels_path_idx" ON "inv_configuracion_rels" USING btree ("path");
  CREATE INDEX "inv_configuracion_rels_users_id_idx" ON "inv_configuracion_rels" USING btree ("users_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_proveedores_fk" FOREIGN KEY ("inv_proveedores_id") REFERENCES "public"."inv_proveedores"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_familias_fk" FOREIGN KEY ("inv_familias_id") REFERENCES "public"."inv_familias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_materiales_fk" FOREIGN KEY ("inv_materiales_id") REFERENCES "public"."inv_materiales"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_equivalencias_fk" FOREIGN KEY ("inv_equivalencias_id") REFERENCES "public"."inv_equivalencias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_ubicaciones_fk" FOREIGN KEY ("inv_ubicaciones_id") REFERENCES "public"."inv_ubicaciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_documentos_fk" FOREIGN KEY ("inv_documentos_id") REFERENCES "public"."inv_documentos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_partidas_fk" FOREIGN KEY ("inv_partidas_id") REFERENCES "public"."inv_partidas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_precios_fk" FOREIGN KEY ("inv_precios_id") REFERENCES "public"."inv_precios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_movimientos_fk" FOREIGN KEY ("inv_movimientos_id") REFERENCES "public"."inv_movimientos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inv_bitacora_fk" FOREIGN KEY ("inv_bitacora_id") REFERENCES "public"."inv_bitacora"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_inv_proveedores_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_proveedores_id");
  CREATE INDEX "payload_locked_documents_rels_inv_familias_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_familias_id");
  CREATE INDEX "payload_locked_documents_rels_inv_materiales_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_materiales_id");
  CREATE INDEX "payload_locked_documents_rels_inv_equivalencias_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_equivalencias_id");
  CREATE INDEX "payload_locked_documents_rels_inv_ubicaciones_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_ubicaciones_id");
  CREATE INDEX "payload_locked_documents_rels_inv_documentos_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_documentos_id");
  CREATE INDEX "payload_locked_documents_rels_inv_partidas_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_partidas_id");
  CREATE INDEX "payload_locked_documents_rels_inv_precios_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_precios_id");
  CREATE INDEX "payload_locked_documents_rels_inv_movimientos_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_movimientos_id");
  CREATE INDEX "payload_locked_documents_rels_inv_bitacora_id_idx" ON "payload_locked_documents_rels" USING btree ("inv_bitacora_id");`)

  /* Igual que 20261012_145900_rls_supabase: las tablas nuevas quedan fuera de
     la API pública de Supabase (RLS sin políticas; Payload entra como dueño). */
  await db.execute(sql`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'inv\_%' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "inv_proveedores_contactos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_proveedores" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_familias" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_materiales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_equivalencias" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_ubicaciones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_documentos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_partidas_observaciones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_partidas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_precios" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_movimientos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_bitacora" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_configuracion" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inv_configuracion_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "inv_proveedores_contactos" CASCADE;
  DROP TABLE "inv_proveedores" CASCADE;
  DROP TABLE "inv_familias" CASCADE;
  DROP TABLE "inv_materiales" CASCADE;
  DROP TABLE "inv_equivalencias" CASCADE;
  DROP TABLE "inv_ubicaciones" CASCADE;
  DROP TABLE "inv_documentos" CASCADE;
  DROP TABLE "inv_partidas_observaciones" CASCADE;
  DROP TABLE "inv_partidas" CASCADE;
  DROP TABLE "inv_precios" CASCADE;
  DROP TABLE "inv_movimientos" CASCADE;
  DROP TABLE "inv_bitacora" CASCADE;
  DROP TABLE "inv_configuracion" CASCADE;
  DROP TABLE "inv_configuracion_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_proveedores_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_familias_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_materiales_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_equivalencias_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_ubicaciones_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_documentos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_partidas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_precios_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_movimientos_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_inv_bitacora_fk";
  
  DROP INDEX "payload_locked_documents_rels_inv_proveedores_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_familias_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_materiales_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_equivalencias_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_ubicaciones_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_documentos_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_partidas_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_precios_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_movimientos_id_idx";
  DROP INDEX "payload_locked_documents_rels_inv_bitacora_id_idx";
  ALTER TABLE "roles" DROP COLUMN "inventario_usar";
  ALTER TABLE "roles" DROP COLUMN "inventario_documentos";
  ALTER TABLE "roles" DROP COLUMN "inventario_confirmar";
  ALTER TABLE "roles" DROP COLUMN "inventario_ver_precios";
  ALTER TABLE "roles" DROP COLUMN "inventario_requisiciones";
  ALTER TABLE "roles" DROP COLUMN "inventario_movimientos";
  ALTER TABLE "roles" DROP COLUMN "inventario_configurar";
  ALTER TABLE "roles" DROP COLUMN "inventario_obras";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_proveedores_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_familias_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_materiales_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_equivalencias_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_ubicaciones_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_documentos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_partidas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_precios_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_movimientos_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inv_bitacora_id";
  DROP TYPE "public"."enum_roles_inventario_obras";
  DROP TYPE "public"."enum_inv_proveedores_tipo";
  DROP TYPE "public"."enum_inv_proveedores_prioridad";
  DROP TYPE "public"."enum_inv_materiales_unidad_base";
  DROP TYPE "public"."enum_inv_materiales_atributos_pared";
  DROP TYPE "public"."enum_inv_ubicaciones_tipo";
  DROP TYPE "public"."enum_inv_documentos_tipo";
  DROP TYPE "public"."enum_inv_documentos_estado";
  DROP TYPE "public"."enum_inv_documentos_estado_requisicion";
  DROP TYPE "public"."enum_inv_documentos_prioridad";
  DROP TYPE "public"."enum_inv_documentos_origen";
  DROP TYPE "public"."enum_inv_partidas_metodo_empate";
  DROP TYPE "public"."enum_inv_partidas_estado_empate";
  DROP TYPE "public"."enum_inv_precios_fuente";
  DROP TYPE "public"."enum_inv_movimientos_tipo";
  DROP TYPE "public"."enum_inv_bitacora_accion";`)
}
