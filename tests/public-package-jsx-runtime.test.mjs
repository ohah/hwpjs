import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(root, 'package.json'));
const text = readFileSync(join(root, 'tools/build-public-package.mjs'), 'utf8');
// Execute the actual literal producer settings, not a copied JSX policy.
const declaration = /const settings\s*=\s*({[\s\S]*?\n});/.exec(text);
assert.ok(declaration, 'PublicProducerSettingsRequired');
const settings = runInNewContext(
  '(' + declaration[1] + ')',
  { dist: 'unused-test-output' },
  { timeout: 1000 },
);
const policy = { jsx: settings.jsx, define: settings.define };
const outputRoot = resolve(root, 'zig-out/verification/public-package-jsx-test');
mkdirSync(outputRoot, { recursive: true });
const work = mkdtempSync(join(outputRoot, 'run-'));
const input = join(work, 'fixture.tsx');
writeFileSync(input, 'export function Fixture(){return <div id="public-jsx">RN</div>;}\n');
function compile(options, name, producerMode = 'development') {
  const out = join(work, name + '.mjs');
  const script = `const result=await Bun.build({entrypoints:[${JSON.stringify(input)}],target:'browser',format:'esm',external:['react','react/*'],...${JSON.stringify(options)},write:false});if(!result.success)throw Error(result.logs.map(String).join('\\n'));await Bun.write(${JSON.stringify(out)},await result.outputs[0].text());`;
  const result = spawnSync('bun', ['--eval', script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: producerMode },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  let code = readFileSync(out, 'utf8');
  code = code.replace(/(['"])(react\/jsx(?:-dev)?-runtime)\1/g, (_, quote, name) =>
    JSON.stringify(pathToFileURL(require.resolve(name)).href),
  );
  writeFileSync(out, code);
  return out;
}
function evaluate(file, mode) {
  return spawnSync(
    'node',
    [
      '--input-type=module',
      '--eval',
      `const {Fixture}=await import(${JSON.stringify(pathToFileURL(file).href)});const value=Fixture();if(value.type!=='div'||value.props.id!=='public-jsx')throw Error('InvalidReactElement');`,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: mode },
    },
  );
}

test(
  'development JSX compiler default reproduces real production runtime refusal',
  { timeout: 30_000 },
  () => {
    const baseline = compile({}, 'baseline');
    const result = evaluate(baseline, 'production');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /jsxDEV.*not a function/);
  },
);
for (const producerMode of ['production', 'development']) {
  for (const consumerMode of ['production', 'development']) {
    test(
      `public producer ${producerMode} JSX evaluates with actual React ${consumerMode}`,
      { timeout: 30_000 },
      () => {
        const candidate = compile(
          policy,
          'candidate-' + producerMode + '-' + consumerMode,
          producerMode,
        );
        const result = evaluate(candidate, consumerMode);
        assert.equal(result.status, 0, result.stdout + result.stderr);
      },
    );
  }
}
