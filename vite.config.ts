import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;

// The station UI lives in src/web; /api and /ext are proxied to the Fastify server.
export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
      '/ext': apiTarget,
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
});
