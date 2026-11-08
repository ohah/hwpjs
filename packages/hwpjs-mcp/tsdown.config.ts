import { defineConfig } from 'tsdown';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  entry: { index: 'src/index.ts' },
  outDir: 'dist',
  platform: 'node',
  target: 'node24.20',
  format: 'esm',
  fixedExtension: true,
  clean: true,
  envFile: [],
  dts: false,
  sourcemap: false,
});
