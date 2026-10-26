import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, SET_CHARACTER_STRIKE_COMMAND } from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
async function setup(failure: boolean | 'applied' = false, patch: Record<string, unknown> = {}) {
  const calls: any[] = [],
    statuses: string[] = [],
    results: any[] = [];
  const content = {
    format: 'hwp5',
    characterPropertiesAvailable: true,
    paragraphAlignmentAvailable: true,
    characterUnderlineAvailable: true,
    characterUnderlines: [{ id: 0, kind: 'none' }],
    characterShapes: [{ id: 0, bold: true, italic: false, height: 1200 }],
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, id: '99' },
        characterRanges: [{ start: 0, end: 2, charShapeId: 0 }],
        paragraphShape: { alignment: 1 },
      },
    ],
    ...patch,
  };
  const e = createEditor({
    runtimeFactory: () => ({
      async request(m: any) {
        calls.push(m);
        return ['load', 'enable'].includes(m.kind)
          ? { kind: m.kind, content }
          : failure
            ? { kind: m.kind, error: 'NativeRefused', applied: failure === 'applied' }
            : { kind: m.kind, content, meta: { application: 'applied', changed: true } };
      },
      dispose() {},
    }),
  });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const select = async (startUnit = 0, endUnit = 2) =>
    e.setSelection({
      ...e.getEditorState().token,
      coordinateSpace: 'display',
      format: 'hwp5',
      owner: 'section:0:body',
      section: 0,
      paragraph: 0,
      startUnit,
      endUnit,
      affinity: 'forward',
    });
  const bridge = createFormattingBridge({
    editor: e,
    onStatus: (s) => statuses.push(s),
    onResult: (r) => results.push(r),
  });
  return { e, calls, statuses, results, select, bridge };
}
// Explicit strike capability/observation coverage. Controlled runtime only, not Native proof.
test('strike true/false uses the public typed command and fresh exact selection target', async () => {
  for (const enabled of [false, true]) {
    const { e, select, calls } = await setup(false, {
      characterStrikeAvailable: true,
      characterStrikes: [{ id: 0, enabled }],
    });
    const dispatched: any[] = [];
    try {
      const bridge = createFormattingBridge({
        editor: {
          getEditorState: () => e.getEditorState(),
          dispatchCommand: ((command: any, payload: any) => {
            dispatched.push({ command, payload });
            return e.dispatchCommand(command, payload);
          }) as any,
        },
        onStatus: () => {},
      });
      await select(0, 2);
      assert.equal(bridge.getPresentation().actions?.strike?.pressed, enabled);
      await select(1, 2);
      const current = e.getEditorState();
      await bridge.action({ command: 'strike' });
      assert.equal(dispatched.length, 1);
      assert.equal(dispatched[0].command.id, SET_CHARACTER_STRIKE_COMMAND.id);
      assert.equal(dispatched[0].payload.enabled, !enabled);
      assert.deepEqual(dispatched[0].payload.target, {
        ...current.token,
        coordinateSpace: 'display',
        format: 'hwp5',
        owner: 'section:0:body',
        section: 0,
        paragraph: 0,
        startUnit: 1,
        endUnit: 2,
        affinity: 'forward',
      });
      assert.equal(calls.at(-1).kind, 'character-strike');
      assert.equal(calls.at(-1).enabled, !enabled);
      assert.equal(calls.at(-1).startUnit, 1);
      assert.equal(calls.at(-1).endUnit, 2);
    } finally {
      await e.dispose();
    }
  }
});
test('mixed strike explicitly enables the selected range, never defaults unknown to false', async () => {
  const patch = {
    characterStrikeAvailable: true,
    characterStrikes: [
      { id: 0, enabled: false },
      { id: 1, enabled: true },
    ],
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, id: '99' },
        characterRanges: [
          { start: 0, end: 1, charShapeId: 0 },
          { start: 1, end: 2, charShapeId: 1 },
        ],
      },
    ],
  };
  const { e, select, bridge, calls } = await setup(false, patch);
  try {
    await select();
    assert.equal(bridge.getPresentation().actions?.strike?.pressed, 'mixed');
    assert.equal(bridge.getPresentation().actions?.strike?.enabled, true);
    await bridge.action({ command: 'strike' });
    assert.equal(calls.at(-1).kind, 'character-strike');
    assert.equal(calls.at(-1).enabled, true);
  } finally {
    await e.dispose();
  }
});
test('unknown or malformed strike observation is disabled with reason and sends nothing', async () => {
  for (const characterStrikes of [
    [],
    [{ id: 0, enabled: 'true' }],
    [{ id: 99, enabled: false }],
    [{ id: 0, enabled: null }],
  ]) {
    const { e, select, bridge, calls, statuses } = await setup(false, {
      characterStrikeAvailable: true,
      characterStrikes,
    });
    try {
      await select();
      const before = calls.length,
        p = bridge.getPresentation().actions?.strike;
      assert.equal(p?.enabled, false);
      assert.equal(p?.reason, 'UnknownCharacterStrike');
      assert.equal(p?.pressed, undefined);
      await bridge.action({ command: 'strike' });
      assert.equal(calls.length, before);
      assert.equal(statuses.at(-1), 'UnknownCharacterStrike');
    } finally {
      await e.dispose();
    }
  }
});
test('strike missing capability, caret and stale target retain explicit refusal without runtime writes', async () => {
  for (const scenario of ['missing', 'caret', 'stale'] as const) {
    const { e, select, calls, statuses } = await setup(
      false,
      scenario === 'missing'
        ? {}
        : { characterStrikeAvailable: true, characterStrikes: [{ id: 0, enabled: false }] },
    );
    try {
      await select(0, scenario === 'caret' ? 0 : 2);
      const current = e.getEditorState();
      const bridge = createFormattingBridge({
        editor: {
          getEditorState: () =>
            scenario === 'stale'
              ? new Proxy(current, {
                  get: (target, key) =>
                    key === 'selection'
                      ? { ...(current.selection as object), viewRevision: current.viewRevision + 1 }
                      : Reflect.get(target, key),
                })
              : e.getEditorState(),
          dispatchCommand: e.dispatchCommand.bind(e),
        },
        onStatus: (s) => statuses.push(s),
      });
      const reason =
        scenario === 'missing'
          ? 'FormattingCapabilityUnavailable'
          : scenario === 'caret'
            ? 'EmptyCharacterSelection'
            : 'StaleTarget';
      assert.equal(bridge.getPresentation().actions?.strike?.enabled, false);
      assert.equal(bridge.getPresentation().actions?.strike?.reason, reason);
      const before = calls.length;
      await bridge.action({ command: 'strike' });
      assert.equal(calls.length, before);
      assert.equal(statuses.at(-1), reason);
    } finally {
      await e.dispose();
    }
  }
});
