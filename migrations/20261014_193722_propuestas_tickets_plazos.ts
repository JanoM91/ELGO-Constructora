import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Propuestas de categoría u obra, foto de ticket y pagos a plazos (heredado de
 * MacAuto Finanzas, docs/63 y 68). Solo agrega: dos tablas, cuatro columnas y
 * sus índices. Las tablas nuevas nacen con RLS activado y sin acceso para los
 * roles de la API pública de Supabase, igual que 20261012_145900_rls_supabase.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "fin_operaciones_calendario" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"fecha" varchar,
  	"importe" numeric NOT NULL,
  	"nota" varchar
  );
  
  CREATE TABLE "fin_configuracion_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  ALTER TABLE "fin_operaciones" ADD COLUMN "categoria_propuesta" varchar;
  ALTER TABLE "fin_operaciones" ADD COLUMN "actividad_propuesta" varchar;
  ALTER TABLE "fin_operaciones" ADD COLUMN "por_revisar" boolean DEFAULT false;
  ALTER TABLE "fin_operaciones" ADD COLUMN "grupo_ticket" varchar;
  ALTER TABLE "fin_operaciones_calendario" ADD CONSTRAINT "fin_operaciones_calendario_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."fin_operaciones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "fin_configuracion_rels" ADD CONSTRAINT "fin_configuracion_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."fin_configuracion"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "fin_configuracion_rels" ADD CONSTRAINT "fin_configuracion_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "fin_operaciones_calendario_order_idx" ON "fin_operaciones_calendario" USING btree ("_order");
  CREATE INDEX "fin_operaciones_calendario_parent_id_idx" ON "fin_operaciones_calendario" USING btree ("_parent_id");
  CREATE INDEX "fin_configuracion_rels_order_idx" ON "fin_configuracion_rels" USING btree ("order");
  CREATE INDEX "fin_configuracion_rels_parent_idx" ON "fin_configuracion_rels" USING btree ("parent_id");
  CREATE INDEX "fin_configuracion_rels_path_idx" ON "fin_configuracion_rels" USING btree ("path");
  CREATE INDEX "fin_configuracion_rels_users_id_idx" ON "fin_configuracion_rels" USING btree ("users_id");
  CREATE INDEX "fin_operaciones_por_revisar_idx" ON "fin_operaciones" USING btree ("por_revisar");
  CREATE INDEX "fin_operaciones_grupo_ticket_idx" ON "fin_operaciones" USING btree ("grupo_ticket");`)
  await db.execute(sql`
    ALTER TABLE public.fin_operaciones_calendario ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.fin_configuracion_rels ENABLE ROW LEVEL SECURITY;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.fin_operaciones_calendario, public.fin_configuracion_rels FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON public.fin_operaciones_calendario, public.fin_configuracion_rels FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "fin_operaciones_calendario" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "fin_configuracion_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "fin_operaciones_calendario" CASCADE;
  DROP TABLE "fin_configuracion_rels" CASCADE;
  DROP INDEX "fin_operaciones_por_revisar_idx";
  DROP INDEX "fin_operaciones_grupo_ticket_idx";
  ALTER TABLE "fin_operaciones" DROP COLUMN "categoria_propuesta";
  ALTER TABLE "fin_operaciones" DROP COLUMN "actividad_propuesta";
  ALTER TABLE "fin_operaciones" DROP COLUMN "por_revisar";
  ALTER TABLE "fin_operaciones" DROP COLUMN "grupo_ticket";`)
}
