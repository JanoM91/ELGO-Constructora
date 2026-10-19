import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Unidades «paquete» (cinchos y taquetes C/100) y «cubeta» (gel lubricante de 5 gal),
 * tal como las cotiza Eléctrico. IF NOT EXISTS: el 19-oct-2026 se aplicó a mano en
 * producción junto con la primera carga de cotizaciones, y se registró en
 * payload_migrations para que el despliegue no la repita.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_inv_materiales_unidad_base" ADD VALUE IF NOT EXISTS 'paquete';
  ALTER TYPE "public"."enum_inv_materiales_unidad_base" ADD VALUE IF NOT EXISTS 'cubeta';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "inv_materiales" ALTER COLUMN "unidad_base" SET DATA TYPE text;
  ALTER TABLE "inv_materiales" ALTER COLUMN "unidad_base" SET DEFAULT 'pieza'::text;
  DROP TYPE "public"."enum_inv_materiales_unidad_base";
  CREATE TYPE "public"."enum_inv_materiales_unidad_base" AS ENUM('pieza', 'metro', 'kilogramo', 'tramo', 'rollo', 'caja', 'lote', 'juego', 'litro', 'bolsa', 'par');
  ALTER TABLE "inv_materiales" ALTER COLUMN "unidad_base" SET DEFAULT 'pieza'::"public"."enum_inv_materiales_unidad_base";
  ALTER TABLE "inv_materiales" ALTER COLUMN "unidad_base" SET DATA TYPE "public"."enum_inv_materiales_unidad_base" USING "unidad_base"::"public"."enum_inv_materiales_unidad_base";`)
}
