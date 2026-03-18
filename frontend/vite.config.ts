import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://server:3001',
        ws: true,
        changeOrigin: true,
      },
      '/health': {
        target: 'http://server:3001',
        changeOrigin: true,
      },
    },
  },
});
