import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../../packages/core/src/state/editor-state.ts';
import {
  createDocumentTextIndex,
  findDocumentTextMatch,
} from '../../../packages/core/src/state/document-text-search.ts';
import {
  documentTextAnchorRequest,
  documentTextAnchorObservation,
} from '../../../packages/core/src/state/document-text-anchor.ts';
import { createDocumentSearchController } from '../src/document-search-controller.ts';
// Actual controller/Core helpers; Native, frame and view transitions are controlled ports.
function harness(options: any = {}) {
  let view = 0,
    version = 1,
    state: any;
  const base = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    nativeHistoryRevision: options.readonly ? undefined : 7,
    status: 'ready' as const,
    capabilities: { readOnly: !!options.readonly },
    content: {
      format: 'hwpx',
      limited: true,
      paragraphs: [{ section: 0, paragraph: 41, text: 'a a a' }],
    },
  };
  const publish = () =>
    (state = new EditorState({ ...base, viewRevision: view, stateVersion: version }));
  publish();
  const trace: any[] = [];
  let anchorCalls = 0,
    selectCalls = 0,
    live = true;
  const stops = new Set<any>();
  const native = () => ({
    schemaVersion: 1,
    scope: 'native-document-text',
    complete: true,
    format: 'hwpx',
    binding: { session: 'native-current', revision: state.nativeHistoryRevision ?? null },
    coverage: { totalParagraphs: 2, sections: [{ section: 0, paragraphCount: 2 }] },
    rows: [
      { ordinal: 0, section: 0, paragraph: 9001, ref: 'first-owner', text: 'a a a' },
      { ordinal: 1, section: 0, paragraph: 9002, ref: 'last-owner', text: 'a' },
    ],
  });
  const editor: any = {
    getEditorState: () => state,
    registerStateListener: (fn: any) => {
      stops.add(fn);
      return () => stops.delete(fn);
    },
    update: async () => {},
    getDocumentTextSnapshot: async () => {
      trace.push(['snapshot', view]);
      return createDocumentTextIndex(state, native());
    },
    getDocumentTextAnchor: async (index: any, point: any) => {
      anchorCalls++;
      const req = documentTextAnchorRequest(index, point, state);
      const ref =
        point.kind === 'created-cell' || point.paragraph === 88 ? 'last-owner' : 'first-owner';
      const reply = {
        schemaVersion: 1,
        scope: 'native-document-text-anchor',
        executionAuthority: false,
        coordinateSpace: 'native-read-inventory',
        format: 'hwpx',
        binding: req.binding,
        ref,
        startUnit: point.unit,
        endUnit: point.unit,
      };
      const result = documentTextAnchorObservation(index, req, reply, state);
      trace.push(['anchor', point.kind, ref, point.unit]);
      if (options.expire) live = false;
      return result;
    },
    getDocumentTextSelection: async (index: any, match: any) => {
      trace.push(['selection', view, match.ref, match.startUnit]);
      return { match };
    },
  };
  const point = {
    kind: 'paragraph' as const,
    section: 0,
    paragraph: 41,
    unit: options.unit ?? 4,
    beforeText: 'a a a',
  };
  const other = options.typed
    ? {
        kind: 'created-cell' as const,
        section: 0,
        identity: '18446744073709551615',
        row: 17,
        column: 31,
        unit: 1,
        beforeText: 'a',
      }
    : options.cross
      ? { ...point, paragraph: 88, unit: 1, beforeText: 'a' }
      : point;
  const controller = createDocumentSearchController({
    editor,
    findMatch: findDocumentTextMatch,
    prepareRead: options.prepare
      ? async () => {
          trace.push(['prepare']);
          if (options.prepareUnavailable) return 'unavailable';
          view++;
          version++;
          publish();
          for (const fn of stops) fn(state);
          return 'refreshed';
        }
      : undefined,
    getCaret: () =>
      options.none
        ? { status: 'none' }
        : options.unavailable
          ? { status: 'unavailable', reason: 'DocumentSearchCaretUnavailable' }
          : {
              status: 'captured',
              capture: { state, anchor: other, focus: point, current: () => live },
            },
    select: async (observation: any) => {
      selectCalls++;
      if (options.reveal && (selectCalls === 1 || options.repeatReveal)) {
        view++;
        version++;
        publish();
        for (const fn of stops) fn(state);
        trace.push(['reveal', view]);
        return { state, status: 'revealed' };
      }
      trace.push(['selected', observation.match.startUnit]);
      return { state };
    },
  });
  return {
    controller,
    trace,
    counts: () => ({ anchorCalls, selectCalls }),
    close: () => controller.dispose(),
  };
}
test('first forward and backward find starts from Native inverse caret, not document start', async () => {
  for (const [direction, expected] of [
    ['forward', 4],
    ['backward', 2],
  ] as const) {
    const h = harness();
    try {
      const r = await h.controller.find({ query: 'a', direction, wrap: false });
      assert.equal(r.status, 'selected');
      assert.equal((r as any).match.startUnit, expected);
      assert.equal(h.counts().anchorCalls, 2);
    } finally {
      h.close();
    }
  }
});
test('cross-owner and typed pending-cell endpoints are ordered by Native inventory refs', async () => {
  for (const patch of [{ cross: true }, { typed: true, readonly: true }]) {
    const h = harness(patch);
    try {
      const r = await h.controller.find({ query: 'a', direction: 'backward', wrap: false });
      assert.equal(r.status, 'selected');
      assert.equal((r as any).match.ref, 'first-owner');
      assert.equal((r as any).match.startUnit, 2);
    } finally {
      h.close();
    }
  }
});
test('offscreen reveal takes fresh snapshot and selection query before reporting selection', async () => {
  const h = harness({ reveal: true });
  try {
    const r = await h.controller.find({ query: 'a', wrap: false });
    assert.equal(r.status, 'selected');
    assert.deepEqual(
      h.trace.filter((x) => x[0] === 'snapshot'),
      [
        ['snapshot', 0],
        ['snapshot', 1],
      ],
    );
    assert.equal(h.trace.filter((x) => x[0] === 'selection').length, 2);
    assert.equal(h.counts().anchorCalls, 2);
    assert.equal(h.counts().selectCalls, 2);
  } finally {
    h.close();
  }
});
test('a second reveal cannot loop or silently skip the current match', async () => {
  const h = harness({ reveal: true, repeatReveal: true });
  try {
    await assert.rejects(h.controller.find({ query: 'a' }), /DocumentSearchSelectionUnavailable/);
    assert.equal(h.counts().selectCalls, 2);
  } finally {
    h.close();
  }
});
test('expired caret capture cancels before selection and unavailable does not fall back to boundary', async () => {
  const h = harness({ expire: true });
  try {
    assert.equal((await h.controller.find({ query: 'a' })).status, 'cancelled');
    assert.equal(h.counts().selectCalls, 0);
  } finally {
    h.close();
  }
  const bad = harness({ unavailable: true });
  try {
    await assert.rejects(bad.controller.find({ query: 'a' }), /DocumentSearchCaretUnavailable/);
    assert.equal(bad.counts().selectCalls, 0);
  } finally {
    bad.close();
  }
  const none = harness({ none: true });
  try {
    const r = await none.controller.find({ query: 'a' });
    assert.equal((r as any).match.startUnit, 0);
    assert.equal(none.counts().anchorCalls, 0);
  } finally {
    none.close();
  }
});

test('source recovery finishes before a new Native index and caret are captured', async () => {
  const h = harness({ prepare: true, readonly: true });
  try {
    assert.equal((await h.controller.find({ query: 'a' })).status, 'selected');
    assert.deepEqual(h.trace[0], ['prepare']);
    assert.deepEqual(h.trace[1], ['snapshot', 1]);
  } finally {
    h.close();
  }
});
test('failed source recovery cannot query or select using an earlier view', async () => {
  const h = harness({ prepare: true, prepareUnavailable: true });
  try {
    await assert.rejects(h.controller.find({ query: 'a' }), /DocumentSearchCaretUnavailable/);
    assert.deepEqual(h.trace, [['prepare']]);
    assert.deepEqual(h.counts(), { anchorCalls: 0, selectCalls: 0 });
  } finally {
    h.close();
  }
});
