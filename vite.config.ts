import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Integrated build: React+TS source in src/ → compiled static app in public/
   (server serves public/; extra files like pool-physics.js are preserved). */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'public',
    emptyOutDir: false,
    target: 'es2020'
  },
  server: { proxy: { '/api': 'http://127.0.0.1:3000', '/rt': { target: 'ws://127.0.0.1:3000', ws: true } } }
});
