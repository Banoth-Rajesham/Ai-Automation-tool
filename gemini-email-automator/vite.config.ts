import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy requests from /api/contactout to the ContactOut API
      '/api/contactout': {
        target: 'https://api.contactout.com',
        changeOrigin: true,
        // Rewrite the path to remove the /api/contactout prefix
        rewrite: (path) => path.replace(/^\/api\/contactout/, ''),
      },
    },
  },
});