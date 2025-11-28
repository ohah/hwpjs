import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: './src/index.ts',
  outDir: './dist/react-native',
  format: ['esm', 'cjs'],
  sourcemap: true,
  dts: true,
  external: [/^react-native/],
});
