import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      // Keeps the browser on one origin in development so the refresh cookie
      // is sent without extra CORS configuration.
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
