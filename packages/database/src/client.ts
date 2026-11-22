import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export function createDatabaseClient(connectionString: string): {
  db: Database;
  pool: Pool;
} {
  const requiresSsl =
    connectionString.includes('supabase.co') ||
    connectionString.includes('supabase.com') ||
    connectionString.includes('sslmode=require');

  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  const db = drizzle(pool, { schema });
  return { db, pool };
}
