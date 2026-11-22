import { config } from 'dotenv';
import { resolve } from 'path';
import { defineConfig } from 'drizzle-kit';

config({ path: resolve(__dirname, '../../.env') });
config();

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://alliance_hcm:alliance_hcm_secret@localhost:5432/alliance_hcm_db',
  },
  verbose: true,
  strict: true,
});
