import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Qué roles pueden usar cada cuenta/caja y cada obra/área al registrar
 * (`usanRoles`; vacío = todos). Las tablas nuevas nacen con RLS y sin acceso
 * para los roles de la API pública de Supabase.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "fin_cuentas_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"roles_id" integer
  );
  
  CREATE TABLE "fin_actividades_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"roles_id" integer
  );
  
  ALTER TABLE "fin_cuentas_rels" ADD CONSTRAINT "fin_cuentas_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."fin_cuentas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "fin_cuentas_rels" ADD CONSTRAINT "fin_cuentas_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "fin_actividades_rels" ADD CONSTRAINT "fin_actividades_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."fin_actividades"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "fin_actividades_rels" ADD CONSTRAINT "fin_actividades_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "fin_cuentas_rels_order_idx" ON "fin_cuentas_rels" USING btree ("order");
  CREATE INDEX "fin_cuentas_rels_parent_idx" ON "fin_cuentas_rels" USING btree ("parent_id");
  CREATE INDEX "fin_cuentas_rels_path_idx" ON "fin_cuentas_rels" USING btree ("path");
  CREATE INDEX "fin_cuentas_rels_roles_id_idx" ON "fin_cuentas_rels" USING btree ("roles_id");
  CREATE INDEX "fin_actividades_rels_order_idx" ON "fin_actividades_rels" USING btree ("order");
  CREATE INDEX "fin_actividades_rels_parent_idx" ON "fin_actividades_rels" USING btree ("parent_id");
  CREATE INDEX "fin_actividades_rels_path_idx" ON "fin_actividades_rels" USING btree ("path");
  CREATE INDEX "fin_actividades_rels_roles_id_idx" ON "fin_actividades_rels" USING btree ("roles_id");`)
  await db.execute(sql`
    ALTER TABLE public.fin_cuentas_rels ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.fin_actividades_rels ENABLE ROW LEVEL SECURITY;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.fin_cuentas_rels, public.fin_actividades_rels FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON public.fin_cuentas_rels, public.fin_actividades_rels FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "fin_cuentas_rels" CASCADE;
  DROP TABLE "fin_actividades_rels" CASCADE;`)
}
