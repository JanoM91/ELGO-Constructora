import * as migration_20261012_145835_inicial from './20261012_145835_inicial';
import * as migration_20261012_145900_rls_supabase from './20261012_145900_rls_supabase';
import * as migration_20261014_193722_propuestas_tickets_plazos from './20261014_193722_propuestas_tickets_plazos';
import * as migration_20261019_151532_inventario_base from './20261019_151532_inventario_base';
import * as migration_20261019_180537_unidades_paquete_cubeta from './20261019_180537_unidades_paquete_cubeta';

export const migrations = [
  {
    up: migration_20261012_145835_inicial.up,
    down: migration_20261012_145835_inicial.down,
    name: '20261012_145835_inicial',
  },
  {
    up: migration_20261012_145900_rls_supabase.up,
    down: migration_20261012_145900_rls_supabase.down,
    name: '20261012_145900_rls_supabase',
  },
  {
    up: migration_20261014_193722_propuestas_tickets_plazos.up,
    down: migration_20261014_193722_propuestas_tickets_plazos.down,
    name: '20261014_193722_propuestas_tickets_plazos',
  },
  {
    up: migration_20261019_151532_inventario_base.up,
    down: migration_20261019_151532_inventario_base.down,
    name: '20261019_151532_inventario_base',
  },
  {
    up: migration_20261019_180537_unidades_paquete_cubeta.up,
    down: migration_20261019_180537_unidades_paquete_cubeta.down,
    name: '20261019_180537_unidades_paquete_cubeta'
  },
];
