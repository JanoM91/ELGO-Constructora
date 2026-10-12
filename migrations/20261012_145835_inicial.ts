import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roles_finanzas_ver" AS ENUM('propios', 'alcance', 'todos');
  CREATE TYPE "public"."enum_fin_cuentas_tipo" AS ENUM('banco', 'efectivo', 'caja_chica', 'fondo', 'otro');
  CREATE TYPE "public"."enum_fin_categorias_tipo" AS ENUM('entrada', 'gasto');
  CREATE TYPE "public"."enum_fin_actividades_tipo" AS ENUM('obra', 'area');
  CREATE TYPE "public"."enum_fin_actividades_sector" AS ENUM('publico', 'privado');
  CREATE TYPE "public"."enum_fin_operaciones_tipo" AS ENUM('entrada', 'gasto', 'traspaso', 'aportacion', 'retiro', 'apertura_por_cobrar', 'apertura_por_pagar');
  CREATE TYPE "public"."enum_fin_operaciones_asignacion" AS ENUM('actividad', 'general', 'pendiente', 'no_aplica');
  CREATE TYPE "public"."enum_fin_operaciones_pagado_con" AS ENUM('cuenta', 'propio');
  CREATE TYPE "public"."enum_fin_operaciones_origen" AS ENUM('manual', 'voz', 'importacion', 'apertura');
  CREATE TYPE "public"."enum_fin_movimientos_direccion" AS ENUM('entra', 'sale');
  CREATE TYPE "public"."enum_fin_movimientos_medio" AS ENUM('efectivo', 'transferencia', 'tarjeta', 'cheque', 'deposito');
  CREATE TYPE "public"."enum_fin_movimientos_modalidad" AS ENUM('contado', 'anticipo', 'parcialidad', 'liquidacion', 'financiamiento', 'reembolso', 'traspaso');
  CREATE TYPE "public"."enum_fin_bitacora_accion" AS ENUM('crear', 'corregir', 'clasificar', 'anular', 'cobro', 'pago', 'comprobante', 'revision');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"rol_de_acceso_id" integer,
  	"es_superadmin" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "roles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"descripcion" varchar,
  	"panel_acceso" boolean DEFAULT false,
  	"panel_gestionar_usuarios" boolean DEFAULT false,
  	"finanzas_registrar" boolean DEFAULT false,
  	"finanzas_ver" "enum_roles_finanzas_ver" DEFAULT 'propios' NOT NULL,
  	"finanzas_ver_restringidas" boolean DEFAULT false,
  	"finanzas_ver_saldos" boolean DEFAULT false,
  	"finanzas_ver_utilidad" boolean DEFAULT false,
  	"finanzas_liquidar" boolean DEFAULT false,
  	"finanzas_corregir" boolean DEFAULT false,
  	"finanzas_revisar_comprobantes" boolean DEFAULT false,
  	"finanzas_configurar" boolean DEFAULT false,
  	"finanzas_mover_dinero" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "roles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"fin_actividades_id" integer
  );
  
  CREATE TABLE "fin_cuentas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"tipo" "enum_fin_cuentas_tipo" DEFAULT 'banco' NOT NULL,
  	"saldo_inicial" numeric DEFAULT 0 NOT NULL,
  	"fecha_inicio" varchar NOT NULL,
  	"responsable_id" integer,
  	"activa" boolean DEFAULT true,
  	"notas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "fin_categorias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"tipo" "enum_fin_categorias_tipo" NOT NULL,
  	"restringida" boolean DEFAULT false,
  	"actividad_sugerida_id" integer,
  	"activa" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "fin_actividades" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"tipo" "enum_fin_actividades_tipo" DEFAULT 'obra' NOT NULL,
  	"clave" varchar,
  	"cliente" varchar,
  	"sector" "enum_fin_actividades_sector",
  	"importe_contratado" numeric,
  	"activa" boolean DEFAULT true,
  	"notas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "fin_operaciones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"folio" varchar,
  	"tipo" "enum_fin_operaciones_tipo" NOT NULL,
  	"importe_total" numeric NOT NULL,
  	"fecha_real" varchar NOT NULL,
  	"concepto" varchar NOT NULL,
  	"categoria_id" integer,
  	"actividad_id" integer,
  	"asignacion" "enum_fin_operaciones_asignacion" DEFAULT 'pendiente' NOT NULL,
  	"contraparte" varchar,
  	"notas" varchar,
  	"vence_el" varchar,
  	"pagado_con" "enum_fin_operaciones_pagado_con" DEFAULT 'cuenta',
  	"reembolso_a_id" integer,
  	"capturado_por_id" integer NOT NULL,
  	"origen" "enum_fin_operaciones_origen" DEFAULT 'manual',
  	"anulada" boolean DEFAULT false,
  	"motivo_anulacion" varchar,
  	"anulada_por_id" integer,
  	"anulada_en" timestamp(3) with time zone,
  	"clave_idempotencia" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "fin_movimientos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"operacion_id" integer NOT NULL,
  	"cuenta_id" integer NOT NULL,
  	"direccion" "enum_fin_movimientos_direccion" NOT NULL,
  	"importe" numeric NOT NULL,
  	"fecha_real" varchar NOT NULL,
  	"medio" "enum_fin_movimientos_medio" NOT NULL,
  	"modalidad" "enum_fin_movimientos_modalidad" DEFAULT 'contado',
  	"capturado_por_id" integer NOT NULL,
  	"anulado" boolean DEFAULT false,
  	"clave_idempotencia" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "fin_comprobantes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"operacion_id" integer NOT NULL,
  	"ruta" varchar NOT NULL,
  	"nombre_archivo" varchar NOT NULL,
  	"tipo_contenido" varchar,
  	"tamano" numeric,
  	"subido_por_id" integer NOT NULL,
  	"revisado_por_id" integer,
  	"revisado_en" timestamp(3) with time zone,
  	"clave_idempotencia" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "fin_bitacora" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"operacion_id" integer,
  	"accion" "enum_fin_bitacora_accion" NOT NULL,
  	"campo" varchar,
  	"valor_anterior" varchar,
  	"valor_nuevo" varchar,
  	"motivo" varchar,
  	"usuario_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"roles_id" integer,
  	"fin_cuentas_id" integer,
  	"fin_categorias_id" integer,
  	"fin_actividades_id" integer,
  	"fin_operaciones_id" integer,
  	"fin_movimientos_id" integer,
  	"fin_comprobantes_id" integer,
  	"fin_bitacora_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "fin_configuracion" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"fecha_corte" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_rol_de_acceso_id_roles_id_fk" FOREIGN KEY ("rol_de_acceso_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "roles_rels" ADD CONSTRAINT "roles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roles_rels" ADD CONSTRAINT "roles_rels_fin_actividades_fk" FOREIGN KEY ("fin_actividades_id") REFERENCES "public"."fin_actividades"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "fin_cuentas" ADD CONSTRAINT "fin_cuentas_responsable_id_users_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_categorias" ADD CONSTRAINT "fin_categorias_actividad_sugerida_id_fin_actividades_id_fk" FOREIGN KEY ("actividad_sugerida_id") REFERENCES "public"."fin_actividades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_operaciones" ADD CONSTRAINT "fin_operaciones_categoria_id_fin_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."fin_categorias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_operaciones" ADD CONSTRAINT "fin_operaciones_actividad_id_fin_actividades_id_fk" FOREIGN KEY ("actividad_id") REFERENCES "public"."fin_actividades"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_operaciones" ADD CONSTRAINT "fin_operaciones_reembolso_a_id_users_id_fk" FOREIGN KEY ("reembolso_a_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_operaciones" ADD CONSTRAINT "fin_operaciones_capturado_por_id_users_id_fk" FOREIGN KEY ("capturado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_operaciones" ADD CONSTRAINT "fin_operaciones_anulada_por_id_users_id_fk" FOREIGN KEY ("anulada_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_movimientos" ADD CONSTRAINT "fin_movimientos_operacion_id_fin_operaciones_id_fk" FOREIGN KEY ("operacion_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_movimientos" ADD CONSTRAINT "fin_movimientos_cuenta_id_fin_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."fin_cuentas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_movimientos" ADD CONSTRAINT "fin_movimientos_capturado_por_id_users_id_fk" FOREIGN KEY ("capturado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_comprobantes" ADD CONSTRAINT "fin_comprobantes_operacion_id_fin_operaciones_id_fk" FOREIGN KEY ("operacion_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_comprobantes" ADD CONSTRAINT "fin_comprobantes_subido_por_id_users_id_fk" FOREIGN KEY ("subido_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_comprobantes" ADD CONSTRAINT "fin_comprobantes_revisado_por_id_users_id_fk" FOREIGN KEY ("revisado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_bitacora" ADD CONSTRAINT "fin_bitacora_operacion_id_fin_operaciones_id_fk" FOREIGN KEY ("operacion_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_bitacora" ADD CONSTRAINT "fin_bitacora_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fin_cuentas_fk" FOREIGN KEY ("fin_cuentas_id") REFERENCES "public"."fin_cuentas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fin_categorias_fk" FOREIGN KEY ("fin_categorias_id") REFERENCES "public"."fin_categorias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fin_actividades_fk" FOREIGN KEY ("fin_actividades_id") REFERENCES "public"."fin_actividades"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fin_operaciones_fk" FOREIGN KEY ("fin_operaciones_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fin_movimientos_fk" FOREIGN KEY ("fin_movimientos_id") REFERENCES "public"."fin_movimientos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fin_comprobantes_fk" FOREIGN KEY ("fin_comprobantes_id") REFERENCES "public"."fin_comprobantes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fin_bitacora_fk" FOREIGN KEY ("fin_bitacora_id") REFERENCES "public"."fin_bitacora"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_rol_de_acceso_idx" ON "users" USING btree ("rol_de_acceso_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "roles_nombre_idx" ON "roles" USING btree ("nombre");
  CREATE INDEX "roles_updated_at_idx" ON "roles" USING btree ("updated_at");
  CREATE INDEX "roles_created_at_idx" ON "roles" USING btree ("created_at");
  CREATE INDEX "roles_rels_order_idx" ON "roles_rels" USING btree ("order");
  CREATE INDEX "roles_rels_parent_idx" ON "roles_rels" USING btree ("parent_id");
  CREATE INDEX "roles_rels_path_idx" ON "roles_rels" USING btree ("path");
  CREATE INDEX "roles_rels_fin_actividades_id_idx" ON "roles_rels" USING btree ("fin_actividades_id");
  CREATE UNIQUE INDEX "fin_cuentas_nombre_idx" ON "fin_cuentas" USING btree ("nombre");
  CREATE INDEX "fin_cuentas_responsable_idx" ON "fin_cuentas" USING btree ("responsable_id");
  CREATE INDEX "fin_cuentas_updated_at_idx" ON "fin_cuentas" USING btree ("updated_at");
  CREATE INDEX "fin_cuentas_created_at_idx" ON "fin_cuentas" USING btree ("created_at");
  CREATE UNIQUE INDEX "fin_categorias_nombre_idx" ON "fin_categorias" USING btree ("nombre");
  CREATE INDEX "fin_categorias_actividad_sugerida_idx" ON "fin_categorias" USING btree ("actividad_sugerida_id");
  CREATE INDEX "fin_categorias_updated_at_idx" ON "fin_categorias" USING btree ("updated_at");
  CREATE INDEX "fin_categorias_created_at_idx" ON "fin_categorias" USING btree ("created_at");
  CREATE UNIQUE INDEX "fin_actividades_nombre_idx" ON "fin_actividades" USING btree ("nombre");
  CREATE INDEX "fin_actividades_updated_at_idx" ON "fin_actividades" USING btree ("updated_at");
  CREATE INDEX "fin_actividades_created_at_idx" ON "fin_actividades" USING btree ("created_at");
  CREATE UNIQUE INDEX "fin_operaciones_folio_idx" ON "fin_operaciones" USING btree ("folio");
  CREATE INDEX "fin_operaciones_tipo_idx" ON "fin_operaciones" USING btree ("tipo");
  CREATE INDEX "fin_operaciones_fecha_real_idx" ON "fin_operaciones" USING btree ("fecha_real");
  CREATE INDEX "fin_operaciones_categoria_idx" ON "fin_operaciones" USING btree ("categoria_id");
  CREATE INDEX "fin_operaciones_actividad_idx" ON "fin_operaciones" USING btree ("actividad_id");
  CREATE INDEX "fin_operaciones_reembolso_a_idx" ON "fin_operaciones" USING btree ("reembolso_a_id");
  CREATE INDEX "fin_operaciones_capturado_por_idx" ON "fin_operaciones" USING btree ("capturado_por_id");
  CREATE INDEX "fin_operaciones_anulada_idx" ON "fin_operaciones" USING btree ("anulada");
  CREATE INDEX "fin_operaciones_anulada_por_idx" ON "fin_operaciones" USING btree ("anulada_por_id");
  CREATE UNIQUE INDEX "fin_operaciones_clave_idempotencia_idx" ON "fin_operaciones" USING btree ("clave_idempotencia");
  CREATE INDEX "fin_operaciones_updated_at_idx" ON "fin_operaciones" USING btree ("updated_at");
  CREATE INDEX "fin_operaciones_created_at_idx" ON "fin_operaciones" USING btree ("created_at");
  CREATE INDEX "fin_movimientos_operacion_idx" ON "fin_movimientos" USING btree ("operacion_id");
  CREATE INDEX "fin_movimientos_cuenta_idx" ON "fin_movimientos" USING btree ("cuenta_id");
  CREATE INDEX "fin_movimientos_fecha_real_idx" ON "fin_movimientos" USING btree ("fecha_real");
  CREATE INDEX "fin_movimientos_capturado_por_idx" ON "fin_movimientos" USING btree ("capturado_por_id");
  CREATE UNIQUE INDEX "fin_movimientos_clave_idempotencia_idx" ON "fin_movimientos" USING btree ("clave_idempotencia");
  CREATE INDEX "fin_movimientos_updated_at_idx" ON "fin_movimientos" USING btree ("updated_at");
  CREATE INDEX "fin_movimientos_created_at_idx" ON "fin_movimientos" USING btree ("created_at");
  CREATE INDEX "fin_comprobantes_operacion_idx" ON "fin_comprobantes" USING btree ("operacion_id");
  CREATE INDEX "fin_comprobantes_subido_por_idx" ON "fin_comprobantes" USING btree ("subido_por_id");
  CREATE INDEX "fin_comprobantes_revisado_por_idx" ON "fin_comprobantes" USING btree ("revisado_por_id");
  CREATE UNIQUE INDEX "fin_comprobantes_clave_idempotencia_idx" ON "fin_comprobantes" USING btree ("clave_idempotencia");
  CREATE INDEX "fin_comprobantes_updated_at_idx" ON "fin_comprobantes" USING btree ("updated_at");
  CREATE INDEX "fin_comprobantes_created_at_idx" ON "fin_comprobantes" USING btree ("created_at");
  CREATE INDEX "fin_bitacora_operacion_idx" ON "fin_bitacora" USING btree ("operacion_id");
  CREATE INDEX "fin_bitacora_usuario_idx" ON "fin_bitacora" USING btree ("usuario_id");
  CREATE INDEX "fin_bitacora_updated_at_idx" ON "fin_bitacora" USING btree ("updated_at");
  CREATE INDEX "fin_bitacora_created_at_idx" ON "fin_bitacora" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_roles_id_idx" ON "payload_locked_documents_rels" USING btree ("roles_id");
  CREATE INDEX "payload_locked_documents_rels_fin_cuentas_id_idx" ON "payload_locked_documents_rels" USING btree ("fin_cuentas_id");
  CREATE INDEX "payload_locked_documents_rels_fin_categorias_id_idx" ON "payload_locked_documents_rels" USING btree ("fin_categorias_id");
  CREATE INDEX "payload_locked_documents_rels_fin_actividades_id_idx" ON "payload_locked_documents_rels" USING btree ("fin_actividades_id");
  CREATE INDEX "payload_locked_documents_rels_fin_operaciones_id_idx" ON "payload_locked_documents_rels" USING btree ("fin_operaciones_id");
  CREATE INDEX "payload_locked_documents_rels_fin_movimientos_id_idx" ON "payload_locked_documents_rels" USING btree ("fin_movimientos_id");
  CREATE INDEX "payload_locked_documents_rels_fin_comprobantes_id_idx" ON "payload_locked_documents_rels" USING btree ("fin_comprobantes_id");
  CREATE INDEX "payload_locked_documents_rels_fin_bitacora_id_idx" ON "payload_locked_documents_rels" USING btree ("fin_bitacora_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "roles" CASCADE;
  DROP TABLE "roles_rels" CASCADE;
  DROP TABLE "fin_cuentas" CASCADE;
  DROP TABLE "fin_categorias" CASCADE;
  DROP TABLE "fin_actividades" CASCADE;
  DROP TABLE "fin_operaciones" CASCADE;
  DROP TABLE "fin_movimientos" CASCADE;
  DROP TABLE "fin_comprobantes" CASCADE;
  DROP TABLE "fin_bitacora" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "fin_configuracion" CASCADE;
  DROP TYPE "public"."enum_roles_finanzas_ver";
  DROP TYPE "public"."enum_fin_cuentas_tipo";
  DROP TYPE "public"."enum_fin_categorias_tipo";
  DROP TYPE "public"."enum_fin_actividades_tipo";
  DROP TYPE "public"."enum_fin_actividades_sector";
  DROP TYPE "public"."enum_fin_operaciones_tipo";
  DROP TYPE "public"."enum_fin_operaciones_asignacion";
  DROP TYPE "public"."enum_fin_operaciones_pagado_con";
  DROP TYPE "public"."enum_fin_operaciones_origen";
  DROP TYPE "public"."enum_fin_movimientos_direccion";
  DROP TYPE "public"."enum_fin_movimientos_medio";
  DROP TYPE "public"."enum_fin_movimientos_modalidad";
  DROP TYPE "public"."enum_fin_bitacora_accion";`)
}
