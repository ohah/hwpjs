import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const url = new URL('../src/document-text-read-permit.ts', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@hwpjs/core/_internal/native-read-source' && context.parentURL === url)
      return {
        url: new URL('../../core/src/_internal/native-read-source.ts', import.meta.url).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { createDocumentTextReadPermit } = await import('../src/document-text-read-permit.ts');
import { EditorState } from '../../core/src/state/editor-state.ts';
import { documentTextSelectionObservation } from '../../core/src/state/document-text-selection.ts';
import { nativeReadSourceOrigin } from '../../core/src/internal/native-read-source-origin.ts';
import {
  observeNativeReadSource,
  inheritNativeReadSource,
} from '../../core/src/internal/native-read-source-evidence.ts';
// Real private source/observation helpers; controlled Native DTO and renderer only.
function fixture(hooks: { geometry?: () => boolean; row?: () => void } = {}) {
  let state = new EditorState({
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 1,
      viewRevision: 1,
      stateVersion: 1,
      status: 'ready',
      content: { format: 'hwpx', paragraphs: [] },
      capabilities: { readOnly: true },
    }),
    active = true,
    geometry = true;
  const binding = {
    schemaVersion: 1,
    scope: 'native-document-text-read-binding',
    executionAuthority: false,
    format: 'hwpx',
    session: 's1',
    epoch: '1',
    serial: '2',
  };
  const context = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    requestId: 1,
  };
  const origin = nativeReadSourceOrigin(
    { kind: 'load', documentTextReadBinding: binding },
    context,
    1,
    { contract: 'hwp5-exclusive-text-delta-v1', sha256: 'controlled-not-actual-module' },
    {},
    () => active,
  );
  observeNativeReadSource(state, origin);
  const request: any = {
    schemaVersion: 1,
    scope: 'native-document-text-selection',
    binding: { session: 's1', revision: null },
    readBinding: { epoch: '1', serial: '2' },
    ref: 'd2-owner:g2',
    startUnit: 0,
    endUnit: 1,
    expectedOriginal: 'x',
  };
  const observation = documentTextSelectionObservation(
    state,
    request,
    {
      ...request,
      format: 'hwpx',
      coordinateSpace: 'native-current-text-observation',
      executionAuthority: false,
      beforeText: 'x',
      target: { kind: 'paragraph', section: 0, paragraph: 9001, startUnit: 0, endUnit: 1 },
    },
    0,
  );
  const range = { section: 0, paragraph: 9000, startUnit: 0, endUnit: 1, expectedText: 'x' };
  const permit = createDocumentTextReadPermit({
    state: () => state,
    active: () => active,
    ready: () => true,
    row: () => {
      hooks.row?.();
      return { text: 'x', editable: false };
    },
    geometry: () => geometry && (hooks.geometry?.() ?? true),
  });
  return {
    permit,
    observation,
    range,
    select() {
      const next = new EditorState({ ...state, content: state.content, stateVersion: 2 } as any);
      inheritNativeReadSource(state, next);
      state = next;
    },
    revoke() {
      active = false;
    },
    badGeometry() {
      geometry = false;
    },
  };
}
test('readonly permit can select an issued current read without creating History or editing permission', () => {
  const h = fixture(),
    token = h.permit.issue(h.observation, () => true);
  assert(token);
  assert(h.permit.current(token, h.range));
  h.select();
  assert(h.permit.current(token, h.range));
  h.revoke();
  assert(!h.permit.current(token, h.range));
});
test('cloned observations and self-replacing getters cannot acquire the read-only permit', () => {
  const h = fixture();
  assert.equal(
    h.permit.issue({ ...h.observation }, () => true),
    null,
  );
  let hits = 0;
  const fake: any = {
    get native() {
      hits++;
      return h.observation.native;
    },
  };
  assert.equal(
    h.permit.issue(fake, () => true),
    null,
  );
  assert.equal(hits, 0);
});
test('widened range, accessor range, changed geometry and retired controller fail closed', () => {
  const h = fixture(),
    token = h.permit.issue(h.observation, () => true);
  assert(token);
  assert(!h.permit.current(token, { ...h.range, endUnit: 2 }));
  let hits = 0;
  const range: any = {
    ...h.range,
    get section() {
      hits++;
      return 0;
    },
  };
  assert(!h.permit.current(token, range));
  assert.equal(hits, 0);
  h.badGeometry();
  assert(!h.permit.current(token, h.range));
  h.permit.dispose();
  assert(!h.permit.current(token, h.range));
});

test('callback reentry cannot recursively validate or revive a retired read permit', () => {
  let h: ReturnType<typeof fixture>,
    token: object | null = null,
    nested: boolean | undefined;
  h = fixture({
    geometry() {
      if (token) nested = h.permit.current(token, h.range);
      return true;
    },
  });
  token = h.permit.issue(h.observation, () => true);
  assert(token);
  assert(h.permit.current(token, h.range));
  assert.equal(nested, false);
  const retired = fixture({
    row() {
      retired.revoke();
    },
  });
  assert.equal(
    retired.permit.issue(retired.observation, () => true),
    null,
  );
});
