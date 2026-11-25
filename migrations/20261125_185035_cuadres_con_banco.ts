import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Cuadre con el banco: el saldo final del estado de cuenta por cuenta y mes
 * (`fin-cuadres`). Solo agrega una tabla; no toca datos existentes. La tabla
 * nace con RLS y sin acceso para los roles de la API pública de Supabase.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "fin_cuadres" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"cuenta_id" integer NOT NULL,
  	"mes" varchar NOT NULL,
  	"saldo_banco" numeric NOT NULL,
  	"notas" varchar,
  	"registrado_por_id" integer NOT NULL,
  	"clave_idempotencia" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "fin_cuadres_id" integer;
  ALTER TABLE "fin_cuadres" ADD CONSTRAINT "fin_cuadres_cuenta_id_fin_cuentas_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."fin_cuentas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "fin_cuadres" ADD CONSTRAINT "fin_cuadres_registrado_por_id_users_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "fin_cuadres_cuenta_idx" ON "fin_cuadres" USING btree ("cuenta_id");
  CREATE INDEX "fin_cuadres_mes_idx" ON "fin_cuadres" USING btree ("mes");
  CREATE INDEX "fin_cuadres_registrado_por_idx" ON "fin_cuadres" USING btree ("registrado_por_id");
  CREATE UNIQUE INDEX "fin_cuadres_clave_idempotencia_idx" ON "fin_cuadres" USING btree ("clave_idempotencia");
  CREATE INDEX "fin_cuadres_updated_at_idx" ON "fin_cuadres" USING btree ("updated_at");
  CREATE INDEX "fin_cuadres_created_at_idx" ON "fin_cuadres" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fin_cuadres_fk" FOREIGN KEY ("fin_cuadres_id") REFERENCES "public"."fin_cuadres"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_fin_cuadres_id_idx" ON "payload_locked_documents_rels" USING btree ("fin_cuadres_id");`)
  await db.execute(sql`
    ALTER TABLE public.fin_cuadres ENABLE ROW LEVEL SECURITY;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.fin_cuadres FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON public.fin_cuadres FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "fin_cuadres" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "fin_cuadres" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fin_cuadres_fk";
  
  DROP INDEX "payload_locked_documents_rels_fin_cuadres_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "fin_cuadres_id";`)
}
