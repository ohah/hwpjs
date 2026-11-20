import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteDeleteTool, captureNoteDeleteAnchor } from '../src/note-delete-tool.ts';
function setup({
  available = true,
  duplicate = false,
  reference = true,
  unit = 1,
  readonly = false,
  delay = false,
} = {}) {
  let state: any = {
    stateVersion: 4,
    status: 'ready',
    nativeHistoryRevision: 0,
    nativeHistoryStats: { protocolVersion: 2 },
    content: {
      format: 'hwpx',
      inlineObjectPlacementVersion: 1,
      noteDeletionAvailable: available,
      readOnly: readonly,
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: 'a\ufffc😀',
          editable: true,
          automaticNumbers: reference
            ? [
                { kind: 'note-reference', unit: 1 },
                ...(duplicate ? [{ kind: 'note-reference', unit: 1 }] : []),
              ]
            : [],
        },
      ],
    },
  };
  const original = state;
  const calls: any[] = [];
  let queries = 0;
  let release: () => void = () => {};
  const barrier = new Promise<void>((r) => (release = r));
  const capture: any = {
    state,
    selector: { section: 0, paragraph: 1 },
    unit,
    expected_text: 'a\ufffc😀',
    current: () => state === original,
  };
  const target: any = { address: { unit: 1, expected_text: capture.expected_text } };
  const editor: any = {
    getEditorState: () => state,
    async getInlineObjectInsertTarget() {
      queries++;
      if (delay) await barrier;
      return target;
    },
    async dispatchCommand(command: any, payload: any) {
      calls.push({ command, payload });
      return { status: 'committed-with-snapshot' };
    },
  };
  const statuses: string[] = [];
  const tool = createNoteDeleteTool({
    editor,
    captureCaret: () => capture,
    onStatus: (t) => statuses.push(t),
    onPresentationChange() {},
    onClose() {},
  });
  return {
    tool,
    editor,
    capture,
    calls,
    statuses,
    target,
    release,
    queries: () => queries,
    stale() {
      state = { ...state };
    },
  };
}
test('delete UI captures exact current reference and dispatches one typed command', async () => {
  const h = setup();
  assert.equal(h.tool.presentation().enabled, true);
  await h.tool.remove();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].command.name, 'delete-note');
  assert.equal(h.calls[0].payload.target, h.target);
  assert.equal(h.calls[0].payload.selectionVersion, 4);
});
for (const settings of [
  { available: false },
  { duplicate: true },
  { reference: false },
  { unit: 2 },
  { readonly: true },
])
  test(
    'delete UI refuses unavailable ambiguous nonreference or wrong caret ' +
      JSON.stringify(settings),
    async () => {
      const h = setup(settings);
      assert.equal(h.tool.presentation().enabled, false);
      await h.tool.remove();
      assert.equal(h.queries(), 0);
      assert.equal(h.calls.length, 0);
    },
  );
test('delete UI async capture rejects stale selection', async () => {
  const h = setup({ delay: true });
  const pending = h.tool.remove();
  h.stale();
  h.release();
  await pending;
  assert.equal(h.calls.length, 0);
});
test('delete UI double action while query pending invokes once', async () => {
  const h = setup({ delay: true });
  const pending = h.tool.remove();
  await h.tool.remove();
  h.release();
  await pending;
  assert.equal(h.queries(), 1);
  assert.equal(h.calls.length, 1);
});
test('delete UI disposed query never dispatches', async () => {
  const h = setup({ delay: true });
  const pending = h.tool.remove();
  h.tool.dispose();
  h.release();
  await pending;
  assert.equal(h.calls.length, 0);
});
test('delete UI changed state cannot reuse captured anchor', () => {
  const h = setup();
  h.stale();
  assert.equal(captureNoteDeleteAnchor(h.editor, h.capture), null);
});
