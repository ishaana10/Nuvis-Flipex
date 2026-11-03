import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in dev so the httpOnly refresh cookie works.
    proxy: {
      '/api': 'http://localhost:8080',
      '/storage': 'http://localhost:8080',
    },
  },
});
