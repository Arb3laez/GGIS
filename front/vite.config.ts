import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Lee API_PORT del mismo .env de la raíz que usa el backend, para que siempre coincidan.
  const env = loadEnv(mode, '..', '');
  const apiPort = env.API_PORT || '4000';

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // En desarrollo, /api va al backend. En producción el backend sirve el front.
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    build: { outDir: 'dist', sourcemap: true },
  };
});
