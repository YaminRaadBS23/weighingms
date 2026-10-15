import { defineConfig } from 'drizzle-kit';

// Dummy OrgaTEX database (training substitute). WeighingMS' own schema gets its own config later.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/integrations/orgatex/dummy/schema.ts',
  out: './src/server/integrations/orgatex/dummy/migrations',
});
