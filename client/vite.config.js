import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import crypto from 'node:crypto';

const buildTime = new Date();
const pad = (n) => String(n).padStart(2, '0');
const buildTimeStr = [
  buildTime.getUTCFullYear(),
  pad(buildTime.getUTCMonth() + 1),
  pad(buildTime.getUTCDate()),
].join('') + '-' + pad(buildTime.getUTCHours()) + pad(buildTime.getUTCMinutes());
const buildSig = crypto.createHash('sha1').update(buildTimeStr).digest('hex').slice(0, 7);

export default defineConfig({
  define: {
    __BUILD_SIG__: JSON.stringify(buildSig),
    __BUILD_TIME__: JSON.stringify(buildTimeStr),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
