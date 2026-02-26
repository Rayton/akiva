import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['events'],
    }),
  ],
  resolve: {
    alias: [
      { find: 'pouchdb', replacement: 'pouchdb-browser' },
      { find: /^spark-md5$/, replacement: '/src/shims/spark-md5-default.ts' },
      { find: /^vuvuzela$/, replacement: '/src/shims/vuvuzela-default.ts' },
    ],
  },
  optimizeDeps: {
    exclude: ['lucide-react', 'pouchdb', 'pouchdb-browser', 'pouchdb-find'],
  },
});
