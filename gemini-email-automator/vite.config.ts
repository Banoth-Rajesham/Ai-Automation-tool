import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy requests to your local backend server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Add a proxy for the confirmation page to redirect to index.html
      '/confirmation': {
        target: 'http://localhost:5173',
        rewrite: (path) => '/index.html'
      }
    },
  },
});