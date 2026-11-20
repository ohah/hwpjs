import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentSearchController } from '../src/document-search-controller.ts';
import {
  createDocumentTextIndex,
  findDocumentTextMatch,
} from '../../../packages/core/src/state/document-text-search.ts';
import {
  documentTextSelectionRequest,
  documentTextSelectionObservation,
} from '../../../packages/core/src/state/document-text-selection.ts';

// Actual Core read-index/matcher/selection DTO validation; controlled editor and
// Surface ports. This does not claim Native, renderer or actual focus evidence.
function harness(options: any = {}) {
  const token = {
    editorId: 'editor',
    documentId: 'doc',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  let state: any = {
    ...token,
    token,
    status: 'ready',
    stateVersion: 1,
    nativeHistoryRevision: 7,
    content: {
      format: 'hwpx',
      limited: true,
      paragraphs: [{ section: 0, paragraph: 91, text: 'visible only' }],
    },
  };
  const listeners = new Set<(s: any) => void>(),
    calls: any[] = [],
    selected: any[] = [];
  const publish = (patch: any = {}) => {
    state = { ...state, ...patch, stateVersion: state.stateVersion + 1 };
    state.token = Object.freeze({
      editorId: state.editorId,
      documentId: state.documentId,
      generation: state.generation,
      operationRevision: state.operationRevision,
      viewRevision: state.viewRevision,
    });
    for (const listener of listeners) listener(state);
    return state;
  };
  const editor: any = {
    getEditorState: () => state,
    registerStateListener(fn: any) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async update() {
      await options.barrier?.();
    },
    async getDocumentTextSnapshot() {
      calls.push('snapshot');
      const captured = state;
      await options.read?.();
      if (state !== captured) throw Error('StaleDocumentTextSnapshot');
      return createDocumentTextIndex(state, {
        schemaVersion: 1,
        scope: 'native-document-text',
        complete: true,
        format: 'hwpx',
        binding: { session: 'native', revision: state.nativeHistoryRevision },
        coverage: { totalParagraphs: 2, sections: [{ section: 0, paragraphCount: 2 }] },
        rows: [
          { ordinal: 0, section: 0, paragraph: 0, ref: 'offscreen-body', text: 'needle body' },
          { ordinal: 1, section: 0, paragraph: 1, ref: 'offscreen-cell', text: 'needle cell' },
        ],
      });
    },
    async getDocumentTextSelection(index: any, match: any) {
      calls.push('selection-query');
      const request = documentTextSelectionRequest(index, match, state);
      await options.query?.();
      return documentTextSelectionObservation(
        state,
        request,
        {
          schemaVersion: 1,
          scope: request.scope,
          coordinateSpace: 'native-current-text-observation',
          executionAuthority: false,
          format: 'hwpx',
          binding: request.binding,
          ref: request.ref,
          expectedOriginal: 'needle',
          beforeText: match.ref === 'offscreen-body' ? 'needle body' : 'needle cell',
          target: {
            section: 0,
            startUnit: 0,
            endUnit: 6,
            ...(match.ref === 'offscreen-body'
              ? { kind: 'paragraph', paragraph: 91 }
              : { kind: 'created-cell', identity: '18446744073709551615', row: 0, column: 1 }),
          },
        },
        0,
      );
    },
  };
  const controller = createDocumentSearchController({
    editor,
    findMatch: findDocumentTextMatch,
    async select(observation, current) {
      selected.push(observation);
      await options.select?.(observation, current);
      if (!current() || options.unavailable) return null;
      const result = publish({ selection: observation.native.target });
      return { state: options.wrongReceipt ? { ...result } : result };
    },
  });
  return { controller, calls, selected, publish, editor, listeners };
}
test('whole-document search ignores the clipped display and retains Native body/cell locators', async () => {
  const h = harness();
  try {
    assert.equal((await h.controller.find({ query: 'needle', wrap: false })).status, 'selected');
    assert.equal(h.selected[0].native.target.paragraph, 91);
    assert.equal((await h.controller.find({ query: 'needle', wrap: false })).status, 'selected');
    assert.equal(h.selected[1].native.target.kind, 'created-cell');
    assert.equal(h.selected[1].native.target.identity, '18446744073709551615');
    assert.equal(h.calls.filter((v) => v === 'snapshot').length, 2);
  } finally {
    h.controller.dispose();
  }
});
test('next previous edge and explicit wrapping use the fresh complete index and selected cursor', async () => {
  const h = harness();
  try {
    await h.controller.find({ query: 'needle', wrap: false });
    await h.controller.find({ query: 'needle', wrap: false });
    assert.equal((await h.controller.find({ query: 'needle', wrap: false })).status, 'edge');
    await h.controller.find({ query: 'needle', wrap: true });
    assert.equal(h.selected.at(-1).native.ref, 'offscreen-body');
    await h.controller.find({ query: 'needle', direction: 'backward', wrap: true });
    assert.equal(h.selected.at(-1).native.ref, 'offscreen-cell');
  } finally {
    h.controller.dispose();
  }
});
test('no match never asks Native to resolve or Surface to select a partial fallback', async () => {
  const h = harness();
  try {
    assert.equal((await h.controller.find({ query: 'absent' })).status, 'not-found');
    assert.deepEqual(h.calls, ['snapshot']);
    assert.deepEqual(h.selected, []);
  } finally {
    h.controller.dispose();
  }
});
test('pending input barrier settles before capture without cancelling the fresh search', async () => {
  let h: ReturnType<typeof harness>,
    once = true;
  h = harness({
    barrier() {
      if (once) {
        once = false;
        h.publish({ operationRevision: 1, nativeHistoryRevision: 8 });
      }
    },
  });
  try {
    assert.equal((await h.controller.find({ query: 'needle' })).status, 'selected');
    assert.equal(h.selected[0].native.binding.revision, 8);
  } finally {
    h.controller.dispose();
  }
});
test('closing the dialog during Native read prevents a late Surface selection', async () => {
  let active = true;
  const h = harness({
    read() {
      active = false;
    },
  });
  try {
    assert.equal(
      (await h.controller.find({ query: 'needle', current: () => active })).status,
      'cancelled',
    );
    assert.deepEqual(h.selected, []);
  } finally {
    h.controller.dispose();
  }
});
test('document ABA during query cancels even when its text and Native revision are unchanged', async () => {
  let h: ReturnType<typeof harness>;
  h = harness({
    query() {
      h.publish({ generation: 2 });
    },
  });
  try {
    assert.equal((await h.controller.find({ query: 'needle' })).status, 'cancelled');
    assert.deepEqual(h.selected, []);
  } finally {
    h.controller.dispose();
  }
});
test('selection unavailable and an unconfirmed receipt never report selected', async () => {
  const missing = harness({ unavailable: true });
  try {
    await assert.rejects(
      missing.controller.find({ query: 'needle' }),
      /DocumentSearchSelectionUnavailable/,
    );
  } finally {
    missing.controller.dispose();
  }
  const wrong = harness({ wrongReceipt: true });
  try {
    assert.equal((await wrong.controller.find({ query: 'needle' })).status, 'cancelled');
  } finally {
    wrong.controller.dispose();
  }
});
test('in-flight request cannot run twice and reset invalidates its delayed selection', async () => {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const h = harness({
    select: () => {
      entered();
      return gate;
    },
  });
  try {
    const first = h.controller.find({ query: 'needle' });
    await started;
    assert.equal((await h.controller.find({ query: 'needle' })).status, 'busy');
    h.controller.reset();
    release();
    assert.equal((await first).status, 'cancelled');
    assert.equal(h.calls.filter((v) => v === 'selection-query').length, 1);
  } finally {
    release();
    h.controller.dispose();
  }
});
test('dispose unsubscribes and cannot revive search or change focus through the selection port', async () => {
  const h = harness();
  h.controller.dispose();
  h.controller.dispose();
  assert.equal(h.listeners.size, 0);
  assert.equal((await h.controller.find({ query: 'needle' })).status, 'cancelled');
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.selected, []);
});
