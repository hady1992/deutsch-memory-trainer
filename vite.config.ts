import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1000,
    },

    esbuild: {
      target: 'es2022',
    },

    optimizeDeps: {
      esbuildOptions: {
        target: 'es2022',
      },
    },

    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
