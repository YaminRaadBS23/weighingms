import { defineConfig } from 'drizzle-kit';

// WeighingMS' own database (weighingms.db). The Dummy OrgaTEX database has its own config.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/weighingms/schema.ts',
  out: './src/server/db/weighingms/migrations',
});
