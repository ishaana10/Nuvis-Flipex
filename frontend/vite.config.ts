import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the flip engine out of the dashboard/admin graph; only reader/preview routes pull it in.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-pageflip': ['page-flip'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Same-origin in dev so the httpOnly refresh cookie works.
    proxy: {
      '/api': 'http://localhost:8080',
      '/storage': 'http://localhost:8080',
    },
  },
});
