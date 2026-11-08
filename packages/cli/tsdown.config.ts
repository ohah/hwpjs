import { defineConfig, type UserConfig } from 'tsdown';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('.', import.meta.url));

// Skill의 독립 실행 파일 계약을 위해 두 진입점을 각각 묶습니다.
export default defineConfig(
  ['cli', 'mcp'].map<UserConfig>((name) => ({
    name,
    cwd,
    entry: { [name]: name === 'cli' ? 'src/bin.ts' : 'src/mcp-bin.ts' },
    outDir: 'dist',
    platform: 'node',
    target: 'node24.11',
    format: 'esm',
    fixedExtension: true,
    clean: false,
    envFile: [],
    dts: false,
    sourcemap: false,
    deps: { alwaysBundle: /./, onlyImport: [] },
    outputOptions: { codeSplitting: false },
  })),
);
