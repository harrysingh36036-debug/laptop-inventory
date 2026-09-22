import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client']
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy REST + Socket.io to the backend during development.
      '/api': { target: 'http://localhost:9634', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:9634', ws: true }
    }
  }
});