import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Cierra la API pública de Supabase sobre estas tablas.
 *
 * Supabase expone automáticamente todo el esquema `public` por su API REST
 * (PostgREST) a cualquiera que tenga la llave «anon». Esta app NO usa esa API:
 * Payload se conecta directo a Postgres con DATABASE_URL, como dueño de las
 * tablas, y para el dueño no aplica RLS. Activar RLS sin políticas deja la
 * API pública sin acceso a nada (usuarios, contraseñas cifradas, dinero) y no
 * cambia nada para la app.
 *
 * Se aplica a todas las tablas de `public` que existan en este momento. Una
 * migración futura que cree tablas nuevas debe repetir este paso (o volver a
 * correr el mismo bloque). En una base Postgres sin Supabase (pruebas locales)
 * también funciona: los roles `anon` y `authenticated` solo se tocan si existen.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
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
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
    END $$;
  `)
}
