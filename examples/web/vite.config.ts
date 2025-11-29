import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    nodePolyfills({
      // Buffer polyfill 포함
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  assetsInclude: ['**/*.wasm'],
});
