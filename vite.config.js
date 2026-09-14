import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.API_PORT ?? '8281';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5273,
    // Fail instead of silently moving to 5274 - the tests would then hit the wrong server.
    strictPort: true,
    // The browser only ever talks to 5273; /api is forwarded, so there is no CORS to configure.
    proxy: { '/api': `http://127.0.0.1:${API_PORT}` },
  },
});
