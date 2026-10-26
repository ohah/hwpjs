import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkJavaScriptModule } from '../tools/pages-demo/javascript-syntax.mjs';

const valid =
  'import value from "./not-installed.js"; export const answer = await value; throw Error("MustNotExecute");';
const isSyntaxError = (error) => error.status !== 0 && /SyntaxError/.test(String(error.stderr));

// 첫 검사에는 실제 Node 탐색·cold start와 파서·런타임 확인이 포함됩니다.
test(
  'generated ESM is parsed by real Node without importing or executing it',
  { timeout: 30_000 },
  () => {
    const executable = checkJavaScriptModule(valid);
    const runtime = JSON.parse(
      execFileSync(
        executable,
        [
          '--eval',
          'console.log(JSON.stringify({name:process.release.name,bun:Boolean(process.versions.bun)}))',
        ],
        { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } },
      ),
    );
    assert.deepEqual(runtime, { name: 'node', bun: false });
  },
);
test('invalid JavaScript is rejected', () => {
  assert.throws(() => checkJavaScriptModule('export const = ;'), isSyntaxError);
});
test('TypeScript annotations in generated JavaScript are rejected', () => {
  assert.throws(() => checkJavaScriptModule('export const value: number = 1;'), isSyntaxError);
});
test('syntax checking is independent of project tsconfig and unresolved type inputs', () => {
  const original = process.cwd(),
    directory = mkdtempSync(join(tmpdir(), 'hwpjs-js-syntax-'));
  try {
    writeFileSync(join(directory, 'tsconfig.json'), '{ this is intentionally invalid JSON');
    writeFileSync(join(directory, 'unrelated.ts'), 'const broken: MissingProjectType = "bad";');
    process.chdir(directory);
    assert.doesNotThrow(() => checkJavaScriptModule(valid));
    assert.throws(() => checkJavaScriptModule('const value: number = 1;'), isSyntaxError);
    assert.throws(() => checkJavaScriptModule('export {;'), isSyntaxError);
  } finally {
    process.chdir(original);
    rmSync(directory, { recursive: true, force: true });
  }
});
