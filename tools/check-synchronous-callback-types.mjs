/** Compile-only regression runner. Requires an existing local TypeScript compiler;
 * performs no install, JS bundle, Native build, or execution of the type fixture.
 * Existing typecheck/CI jobs may invoke: node tools/check-synchronous-callback-types.mjs
 */
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (process.argv.length > 2) throw Error('UnexpectedTypecheckArguments');
const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = resolve(root, 'node_modules/.bin/tsc');
if (!existsSync(compiler))
  throw Error('LocalTypeScriptRequired: install the project toolchain separately');
const temporary = mkdtempSync(join(tmpdir(), 'hwpjs-callback-typecheck-'));
try {
  const config = join(temporary, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        allowImportingTsExtensions: true,
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        types: [],
      },
      files: [resolve(root, 'tests/headless/synchronous-callbacks.typecheck.ts')],
    }),
  );
  const result = spawnSync(compiler, ['-p', config], { cwd: root, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (result.status === 0) console.log('동기 콜백 타입 회귀 10항목 통과 (compile-only).');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
