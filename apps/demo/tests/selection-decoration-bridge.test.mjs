import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, getSelectionFormatting } from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
async function setup() {
  const messages = [],
    statuses = [],
    requests = [],
    results = [];
  const content = {
    format: 'hwp5',
    characterPropertiesAvailable: true,
    characterUnderlineAvailable: true,
    characterStrikeAvailable: true,
    characterUnderlines: [{ id: 0, kind: 'none' }],
    characterStrikes: [{ id: 0, enabled: false }],
    paragraphs: [0, 1].map((paragraph) => ({
      section: 0,
      paragraph,
      text: 'AB',
      editable: true,
      selectionOwner: 'section:0:body',
      currentReference: { kind: 'original', section: 0, id: String(paragraph) },
      characterRanges: [{ start: 0, end: 2, charShapeId: 0 }],
    })),
  };
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        messages.push(m);
        return {
          kind: m.kind,
          content,
          meta: {
            application: ['load', 'enable'].includes(m.kind) ? 'unapplied' : 'applied',
            changed: !['load', 'enable'].includes(m.kind),
          },
        };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  let value = 'mixed',
    reason = null,
    version = 0,
    captureEffect,
    requestEffect;
  const host = {
    captureRangeFormatting(property) {
      const state = editor.getEditorState(),
        seen = version;
      captureEffect?.();
      return {
        state,
        value,
        reason,
        request() {
          requestEffect?.();
          if (seen !== version || reason !== null || value === null) return false;
          requests.push(property);
          return true;
        },
      };
    },
  };
  let currentHost = host;
  const bridge = createFormattingBridge({
    editor,
    onStatus: (s) => statuses.push(s),
    onResult: (r) => results.push(r),
    getSurfaceFormattingHost: () => currentHost,
  });
  return {
    editor,
    bridge,
    messages,
    statuses,
    requests,
    results,
    host,
    setValue: (v) => (value = v),
    setReason: (r) => (reason = r),
    changeRange: () => version++,
    captureEffect: (f) => (captureEffect = f),
    requestEffect: (f) => (requestEffect = f),
    changeHost: () => (currentHost = { ...host }),
    single: () =>
      editor.setSelection({
        ...editor.getEditorState().token,
        coordinateSpace: 'display',
        format: 'hwp5',
        owner: 'section:0:body',
        section: 0,
        paragraph: 0,
        startUnit: 0,
        endUnit: 2,
        affinity: 'forward',
      }),
  };
}
test('공개 Core의 public 선택 null은 그대로 두고 Surface mixed만 표시', async () => {
  const f = await setup();
  try {
    assert.equal(
      getSelectionFormatting(f.editor.getEditorState()).characterAvailableReason,
      'MissingSelection',
    );
    const p = f.bridge.getPresentation();
    assert.equal(p.actions.underline.enabled, true);
    assert.equal(p.actions.underline.pressed, 'mixed');
    assert.equal(p.actions.underline.surfaceSelection, true);
    assert.equal(p.actions.bold.enabled, false);
    assert.equal(f.editor.getEditorState().selection == null, true);
  } finally {
    await f.editor.dispose();
  }
});
for (const property of ['underline', 'strike'])
  test('다문단 ' + property + '은 Surface 한 번 접수하며 Core target을 만들지 않음', async () => {
    const f = await setup();
    try {
      const n = f.messages.length;
      await f.bridge.action({ command: property });
      assert.deepEqual(f.requests, [property]);
      assert.equal(f.messages.length, n);
      assert.equal(f.results.length, 0);
      assert.match(f.statuses.at(-1), /접수/);
    } finally {
      await f.editor.dispose();
    }
  });
test('unknown null과 disabled는 false로 보완하지 않음', async () => {
  const f = await setup();
  try {
    f.setValue(null);
    assert.equal(f.bridge.getPresentation().actions.underline.enabled, false);
    await f.bridge.action({ command: 'underline' });
    assert.equal(f.requests.length, 0);
    f.setValue(false);
    f.setReason('ReadOnly');
    await f.bridge.action({ command: 'strike' });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.editor.dispose();
  }
});
test('관측 뒤 같은 Core state라도 range 변경은 Surface closure에서 거부', async () => {
  const f = await setup();
  try {
    f.bridge.getPresentation();
    f.requestEffect(() => f.changeRange());
    await f.bridge.action({ command: 'underline' });
    assert.equal(f.requests.length, 0);
    assert.match(f.statuses.at(-1), /선택 범위/);
  } finally {
    await f.editor.dispose();
  }
});
test('관측 중 host 교체는 이전 capture를 접수하지 않음', async () => {
  const f = await setup();
  try {
    f.captureEffect(() => f.changeHost());
    await f.bridge.action({ command: 'strike' });
    assert.equal(f.requests.length, 0);
    assert.equal(f.statuses.at(-1), 'StaleSurfaceFormatting');
  } finally {
    await f.editor.dispose();
  }
});
test('단일 public target은 기존 typed 명령을 사용하고 Surface를 통하지 않음', async () => {
  const f = await setup();
  try {
    await f.single();
    await f.bridge.action({ command: 'strike' });
    assert.equal(f.messages.at(-1).kind, 'character-strike');
    assert.equal(f.requests.length, 0);
    await f.bridge.action({ command: 'underline' });
    assert.equal(f.messages.at(-1).kind, 'character-underline');
  } finally {
    await f.editor.dispose();
  }
});
