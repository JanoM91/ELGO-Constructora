import * as migration_20261012_145835_inicial from './20261012_145835_inicial';
import * as migration_20261012_145900_rls_supabase from './20261012_145900_rls_supabase';

export const migrations = [
  {
    up: migration_20261012_145835_inicial.up,
    down: migration_20261012_145835_inicial.down,
    name: '20261012_145835_inicial'
  },
  {
    up: migration_20261012_145900_rls_supabase.up,
    down: migration_20261012_145900_rls_supabase.down,
    name: '20261012_145900_rls_supabase',
  },
];
