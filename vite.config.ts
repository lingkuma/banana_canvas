import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createAiRouter } from './server/ai.mjs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'banana-canvas-ai-server',
          configureServer(server) {
            server.middlewares.use(createAiRouter(env));
          },
          configurePreviewServer(server) {
            server.middlewares.use(createAiRouter(env));
          },
        },
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
