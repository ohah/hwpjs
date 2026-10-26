import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

const source = readFileSync(new URL('../src/CanvasEditor.svelte', import.meta.url), 'utf8');
function resolved(code: string) {
  return code
    .replace(
      /from 'svelte\/internal\/server'/g,
      `from '${import.meta.resolve('svelte/internal/server')}'`,
    )
    .replace("from './action.ts'", `from '${new URL('../src/action.ts', import.meta.url).href}'`);
}
test('actual Svelte component compiles for client and server, with no controlled input subtree', () => {
  for (const generate of ['client', 'server'] as const) {
    const result = compile(source, { filename: 'CanvasEditor.svelte', generate, dev: false });
    assert.deepEqual(result.warnings, []);
    assert.match(result.js.code, /export default function CanvasEditor/);
    assert.doesNotMatch(result.js.code, /<textarea|<canvas|bind_value|\.value\s*=/);
    if (generate === 'client') assert.match(result.js.code, /\$\.action\(/);
  }
});
test('compiled server component renders without DOM, mounting a surface, or touching external editor', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const server = compile(source, {
    filename: 'CanvasEditor.svelte',
    generate: 'server',
    dev: false,
  });
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(resolved(server.js.code)).toString('base64')
  );
  const editor = new Proxy(
    {},
    {
      get() {
        throw Error('EditorTouchedDuringSSR');
      },
    },
  );
  const result = render(module.default, {
    props: {
      editor,
      class: 'editor-root',
      style: 'height:500px',
      'aria-label': '문서',
      onReady() {
        throw Error('MountedDuringSSR');
      },
    },
  });
  assert.match(result.body, /class="editor-root"/);
  assert.match(result.body, /aria-label="문서"/);
  assert.doesNotMatch(result.body, /<canvas|<textarea/);
  assert.equal(typeof globalThis.document, 'undefined');
});
