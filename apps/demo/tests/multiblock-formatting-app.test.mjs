import { demoCommandAction } from '../src/demo-command-action.ts';
import { DEMO_COMMANDS } from '../src/command-support.ts';
import { createClipboardBridge } from '../src/clipboard-bridge.ts';
import { createCharacterShapePort } from '../src/character-shape-port.ts';
import test, { after } from 'node:test';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
const styles = installFormattingTestStyles();
after(() => styles.deregister());
const { createTextColorTool } = await import('../src/text-color-tool.ts');
const { createFontNameTool } = await import('../src/font-name-tool.ts');
import assert from 'node:assert/strict';
import {
  createEditor,
  getSelectionFormatting,
  SET_CHARACTER_FONT_NAME_COMMAND,
  APPLY_FORMATTING_PATCH_COMMAND,
} from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
import {
  captureSurfaceFormatting,
  captureFormattingPresentation,
} from '../src/surface-formatting-capture.ts';
import { resolveCommandSupport } from '../src/command-support.ts';
async function setup() {
  const messages = [],
    requests = [],
    statuses = [],
    results = [];
  const content = {
    format: 'hwp5',
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, id: '0' },
        characterRanges: [{ start: 0, end: 2, charShapeId: 0 }],
      },
    ],
  };
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        messages.push(m);
        return { kind: m.kind, content, meta: { application: 'unapplied', changed: false } };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  let serial = 0,
    reason = null,
    beforeRequest,
    captureCallback;
  const host = {
    captureSelectionFormatting() {
      const state = editor.getEditorState(),
        seen = serial;
      captureCallback?.();
      const base = getSelectionFormatting(state);
      return {
        state,
        observation: {
          size: 1500,
          bold: 'mixed',
          italic: false,
          underline: false,
          strike: false,
          textColor: '#123456',
          fontNames: Object.fromEntries(
            Object.keys(base.fontNames).map((k) => [k, { kind: 'single', name: '원본' }]),
          ),
          align: 'LEFT',
        },
        reasons: {
          characterAvailableReason: reason,
          underlineAvailableReason: reason,
          strikeAvailableReason: reason,
          textColorAvailableReason: reason,
          fontNameAvailableReasons: Object.fromEntries(
            Object.keys(base.fontNames).map((k) => [k, reason]),
          ),
          paragraphAvailableReason: reason,
        },
        current: () => seen === serial,
        settledCurrent: () => seen === serial,
        bindDialog: () => seen === serial,
        settle: async () => ({
          result: { status: 'known-no-op', state: editor.getEditorState(), changed: false },
          current: seen === serial,
        }),
        request(intent) {
          beforeRequest?.();
          if (seen !== serial || reason) return false;
          requests.push(intent);
          return true;
        },
      };
    },
  };
  const bridge = createFormattingBridge({
    editor,
    getSurfaceFormattingHost: () => host,
    onStatus: (s) => statuses.push(s),
    onResult: (r) => results.push(r),
  });
  return {
    editor,
    host,
    bridge,
    messages,
    requests,
    statuses,
    results,
    change: () => serial++,
    reason: (r) => (reason = r),
    onCapture: (f) => (captureCallback = f),
    onRequest: (f) => (beforeRequest = f),
  };
}
for (const command of ['bold', 'italic', 'underline', 'strike', 'set-font-size', 'align-center'])
  test('범위 ' + command + ' 단일 접수/Core target 유지', async () => {
    const f = await setup();
    try {
      await f.bridge.action(command === 'set-font-size' ? { command, points: 17 } : { command });
      assert.equal(f.requests.length, 1);
      assert.equal(f.results.length, 1, '완료 실제 결과만 전달');
      assert.equal(f.editor.getEditorState().selection == null, true);
    } finally {
      await f.editor.dispose();
    }
  });
test('동일 원본 크기 no-op 요청0', async () => {
  const f = await setup();
  try {
    await f.bridge.action({ command: 'set-font-size', points: 15 });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.editor.dispose();
  }
});
test('Coreupdate 중 A→B Core null→null 거부', async () => {
  const f = await setup();
  try {
    const editor = {
      getEditorState: () => f.editor.getEditorState(),
      dispatchCommand: () => assert.fail('core dispatch'),
      update: async () => f.change(),
    };
    const bridge = createFormattingBridge({
      editor,
      getSurfaceFormattingHost: () => f.host,
      onStatus: () => {},
    });
    await bridge.action({ command: 'bold' });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.editor.dispose();
  }
});
test('요청 재진입 범위 변경은 Surface에서 거부', async () => {
  const f = await setup();
  try {
    f.onRequest(f.change);
    await f.bridge.action({ command: 'italic' });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.editor.dispose();
  }
});
test('readonly 원값 표시는 유지 writer 거부', async () => {
  const f = await setup();
  try {
    f.reason('ReadOnlyDocument');
    const p = f.bridge.getPresentation();
    assert.equal(p.fontSizePoints, 15);
    assert.equal(p.actions.bold.enabled, false);
    await f.bridge.action({ command: 'bold' });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.editor.dispose();
  }
});
test('캡처콜백 A→B 거부', async () => {
  const f = await setup();
  try {
    f.onCapture(f.change);
    const cap = captureSurfaceFormatting(
      f.editor,
      () => f.host,
      f.editor.getEditorState(),
      getSelectionFormatting(f.editor.getEditorState()),
    );
    assert.equal(cap, null);
  } finally {
    await f.editor.dispose();
  }
});
test('캡처 일회성/Core state 유지여도 두번째 거부', async () => {
  const f = await setup();
  try {
    const cap = captureSurfaceFormatting(
      f.editor,
      () => f.host,
      f.editor.getEditorState(),
      getSelectionFormatting(f.editor.getEditorState()),
    );
    assert.equal(cap.request({ kind: 'strike', enabled: true }), true);
    assert.equal(cap.request({ kind: 'strike', enabled: false }), false);
    assert.equal(f.requests.length, 1);
  } finally {
    await f.editor.dispose();
  }
});
for (const context of [
  { busy: true },
  { disposed: true },
  { document: 'loading' },
  { document: 'none' },
])
  test('명령별 범위허용도 상위 deny 유지 ' + JSON.stringify(context), () => {
    assert.equal(
      resolveCommandSupport('bold', {
        connected: true,
        document: 'ready',
        hasSelection: false,
        availability: { enabled: true, surfaceSelection: true },
        ...context,
      }).enabled,
      false,
    );
  });

for (const kind of ['color', 'font'])
  for (const mode of [
    'apply',
    'no-op',
    'stale-after-update',
    'readonly',
    'dispose',
    'bind-failure',
  ])
    test('모달 ' + kind + ' ' + mode + ' 단일범위캡처 수명', async () => {
      const f = await setup();
      let callbacks, viewState;
      const results = [];
      if (mode === 'bind-failure') {
        const capture = f.host.captureSelectionFormatting;
        f.host.captureSelectionFormatting = () => ({ ...capture(), bindDialog: () => false });
      }
      const createView = (_root, cb) => {
        callbacks = cb;
        return {
          getDialogElement: () => ({}),
          update(v) {
            viewState = v;
          },
          show() {},
          dispose() {},
          isComposing: () => false,
        };
      };
      const editor = {
        getEditorState: () => f.editor.getEditorState(),
        registerStateListener: (fn) => f.editor.registerStateListener(fn),
        dispatchCommand: () => assert.fail('가짜 Core target 요청 금지'),
        update: async () => {
          if (mode === 'stale-after-update') f.change();
        },
      };
      const options = {
        root: {},
        editor,
        getSurfaceFormattingHost: () => f.host,
        onStatus: () => {},
        onClose: () => {},
        onPresentationChange: () => {},
        onResult: (r) => results.push(r),
        createView,
      };
      const tool =
        kind === 'color'
          ? createTextColorTool(options)
          : createFontNameTool({
              ...options,
              api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
            });
      try {
        if (mode === 'readonly') f.reason('ReadOnlyDocument');
        if (kind === 'color') tool.action('text-color');
        else tool.open();
        await new Promise((resolve) => setImmediate(resolve));
        if (kind === 'font') callbacks.onLanguage('hangul');
        callbacks.onInput(
          mode === 'no-op'
            ? kind === 'color'
              ? '#123456'
              : '원본'
            : kind === 'color'
              ? '#abcdef'
              : '새 글꼴',
        );
        if (mode === 'readonly' || mode === 'bind-failure') assert.equal(viewState.canApply, false);
        if (mode === 'no-op') assert.equal(viewState.canApply, false);
        if (mode === 'dispose') tool.dispose();
        callbacks.onApply();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(f.requests.length, mode === 'apply' ? 1 : 0);
        if (mode === 'apply')
          assert.equal(f.requests[0].kind, kind === 'color' ? 'text-color' : 'font-name');
        assert.equal(results.length, mode === 'apply' ? 1 : 0);
      } finally {
        tool.dispose();
        await f.editor.dispose();
      }
    });

test('기존 custom font 포트 presentation는 새 observe callback을 호출하지 않음', () => {
  let calls = 0;
  const editor = {
    getEditorState: () => ({ status: 'ready', selection: {} }),
    registerStateListener: () => () => {},
    update: async () => {},
    dispatchCommand: async () => {},
  };
  const tool = createFontNameTool({
    root: {},
    editor,
    api: {
      command: SET_CHARACTER_FONT_NAME_COMMAND,
      observe: () => {
        calls++;
        throw Error('unexpected');
      },
    },
    onClose() {},
    onStatus() {},
    createView: () => assert.fail('view'),
  });
  try {
    assert.equal(tool.presentation().enabled, true);
    assert.equal(calls, 0);
  } finally {
    tool.dispose();
  }
});

test('다문단 strike null을 false로 바꾸거나 토글 허용하지 않음', async () => {
  const f = await setup();
  try {
    const get = f.host.captureSelectionFormatting;
    f.host.captureSelectionFormatting = () => {
      const cap = get();
      cap.observation.strike = null;
      return cap;
    };
    assert.equal(f.bridge.getPresentation().actions.strike.enabled, false);
    await f.bridge.action({ command: 'strike' });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.editor.dispose();
  }
});

test('한 표시 호출의 bridge/color/font는 범위 관측 1회만 공유하고 action은 새 캡처', async () => {
  const f = await setup();
  let count = 0;
  const get = f.host.captureSelectionFormatting;
  f.host.captureSelectionFormatting = () => {
    count++;
    return get();
  };
  const options = {
    root: {},
    editor: f.editor,
    getSurfaceFormattingHost: () => f.host,
    onStatus() {},
    onClose() {},
    onPresentationChange() {},
  };
  const color = createTextColorTool(options),
    font = createFontNameTool({
      ...options,
      api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
    });
  try {
    const shared = captureFormattingPresentation(f.editor, () => f.host);
    f.bridge.getPresentation(shared);
    color.presentation(shared);
    font.presentation(shared);
    assert.equal(count, 1);
    f.change();
    assert.equal(f.bridge.getPresentation(shared).actions.bold.enabled, false);
    assert.equal(
      resolveCommandSupport('text-color', {
        connected: true,
        document: 'ready',
        hasSelection: false,
        availability: color.presentation(shared)['text-color'],
      }).enabled,
      false,
    );
    assert.equal(count, 1, '오래된 shared를 재캡처하지 않음');
    await f.bridge.action({ command: 'bold' });
    assert.equal(count, 2, '실행은 freshcapture');
  } finally {
    color.dispose();
    font.dispose();
    await f.editor.dispose();
  }
});
for (const mode of ['apply', 'no-op', 'unsupported', 'stale', 'readonly'])
  test('대표 7언어 ' + mode + ' 는 단일 벡터 또는 요청0', async () => {
    const f = await setup();
    let callbacks, last;
    const capture = f.host.captureSelectionFormatting;
    f.host.captureSelectionFormatting = () => {
      const c = capture();
      c.reasons.fontNamesAvailableReason =
        mode === 'unsupported' ? 'AtomicFontNamesUnavailable' : null;
      return c;
    };
    const editor = {
      getEditorState: () => f.editor.getEditorState(),
      registerStateListener: (fn) => f.editor.registerStateListener(fn),
      update: async () => {
        if (mode === 'stale') f.change();
      },
      dispatchCommand: () => assert.fail('단일 setter로 대표 위장 금지'),
    };
    const tool = createFontNameTool({
      root: {},
      editor,
      getSurfaceFormattingHost: () => f.host,
      api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
      onStatus() {},
      onClose() {},
      createView: (_root, cb) => {
        callbacks = cb;
        return {
          getDialogElement: () => ({}),
          update(v) {
            last = v;
          },
          show() {},
          dispose() {},
          isComposing: () => false,
        };
      },
    });
    try {
      if (mode === 'readonly') f.reason('ReadOnlyDocument');
      tool.open();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(last.language, 'representative');
      callbacks.onInput(mode === 'no-op' ? '원본' : '새 대표 글꼴');
      if (['no-op', 'unsupported', 'readonly'].includes(mode)) assert.equal(last.canApply, false);
      callbacks.onApply();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(f.requests.length, mode === 'apply' ? 1 : 0);
      if (mode === 'apply') {
        assert.equal(f.requests[0].kind, 'font-names');
        assert.deepEqual(
          f.requests[0].names,
          Object.fromEntries(
            ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map((l) => [
              l,
              '새 대표 글꼴',
            ]),
          ),
        );
      }
    } finally {
      tool.dispose();
      await f.editor.dispose();
    }
  });

for (const allowAll of [true, false])
  test('단일 Core 대표 7개 live 권한 ' + allowAll + '에 따른 원자 dispatch', async () => {
    const f = await setup();
    let callbacks, last;
    const calls = [];
    try {
      const state = f.editor.getEditorState();
      await f.editor.setSelection({
        ...state.token,
        coordinateSpace: 'display',
        format: 'hwp5',
        owner: 'section:0:body',
        section: 0,
        paragraph: 0,
        startUnit: 0,
        endUnit: 2,
        affinity: 'forward',
      });
      const real = getSelectionFormatting(f.editor.getEditorState());
      const observation = {
        ...real,
        fontNames: Object.fromEntries(
          Object.keys(real.fontNames).map((l) => [l, { kind: 'single', name: '원본' }]),
        ),
        fontNameAvailableReasons: Object.fromEntries(
          Object.keys(real.fontNames).map((l) => [l, null]),
        ),
      };
      const editor = {
        getEditorState: () => f.editor.getEditorState(),
        registerStateListener: (fn) => f.editor.registerStateListener(fn),
        update: async () => {},
        dispatchCommand: async (command, payload) => {
          calls.push({ command, payload });
          return { status: 'known-no-op', state: f.editor.getEditorState(), changed: false };
        },
        getFormattingCapabilities: async () => ({
          atomic: true,
          binding: { session: 'test', revision: 1 },
          fields: Object.fromEntries(
            ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map((l) => [
              `character.fonts.${l}.name`,
              { readable: true, writable: allowAll || l !== 'symbol' },
            ]),
          ),
          selectionAdmissionFence: {
            version: 1,
            epoch: 'stateVersion',
            commands: ['APPLY_FORMATTING_PATCH'],
          },
        }),
        queryFormatting: async () => ({
          binding: { session: 'test', revision: 1 },
          targets: [],
          observations: { perTarget: [], aggregate: {} },
        }),
      };
      const tool = createFontNameTool({
        root: {},
        editor,
        atomicCharacterPort: createCharacterShapePort(editor),
        api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: () => observation },
        onStatus() {},
        onClose() {},
        createView: (_root, cb) => {
          callbacks = cb;
          return {
            update(v) {
              last = v;
            },
            show() {},
            dispose() {},
            isComposing: () => false,
          };
        },
      });
      try {
        tool.open();
        await new Promise((resolve) => setImmediate(resolve));
        callbacks.onInput('대표 원자 글꼴');
        assert.equal(last.canApply, allowAll);
        callbacks.onApply();
        await new Promise((resolve) => setImmediate(resolve));
        if (!allowAll) {
          assert.equal(calls.length, 0);
          return;
        }
        assert.equal(calls.length, 1);
        assert.equal(calls[0].command, APPLY_FORMATTING_PATCH_COMMAND);
        assert.deepEqual(
          calls[0].payload.patch.character.fonts,
          Object.fromEntries(
            ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map((l) => [
              l,
              { name: '대표 원자 글꼴' },
            ]),
          ),
        );
      } finally {
        tool.dispose();
      }
    } finally {
      await f.editor.dispose();
    }
  });

for (const kind of ['color', 'font'])
  for (const outcome of ['success', 'unknown', 'rejected', 'stale', 'noop-unpainted'])
    test('모달 ' + kind + ' 실제 응답 대기와 ' + outcome + ' 분리', async () => {
      const f = await setup();
      let callbacks,
        last,
        finish,
        disposed = 0;
      const results = [];
      const get = f.host.captureSelectionFormatting;
      f.host.captureSelectionFormatting = () => ({
        ...get(),
        settle: () => new Promise((resolve) => (finish = resolve)),
      });
      const editor = {
        getEditorState: () => f.editor.getEditorState(),
        registerStateListener: (fn) => f.editor.registerStateListener(fn),
        update: async () => {},
        dispatchCommand: () => assert.fail('단일 Core 위조 금지'),
      };
      const options = {
        root: {},
        editor,
        getSurfaceFormattingHost: () => f.host,
        onStatus() {},
        onClose() {},
        onResult: (r) => results.push(r),
        createView: (_root, cb) => {
          callbacks = cb;
          return {
            getDialogElement: () => ({}),
            update(v) {
              last = v;
            },
            show() {},
            dispose() {
              disposed++;
            },
            isComposing: () => false,
          };
        },
      };
      const tool =
        kind === 'color'
          ? createTextColorTool(options)
          : createFontNameTool({
              ...options,
              api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
            });
      try {
        if (kind === 'color') tool.action('text-color');
        else {
          tool.open('hangul');
        }
        await new Promise((resolve) => setImmediate(resolve));
        callbacks.onInput(kind === 'color' ? '#abcdef' : '새 글꼴');
        callbacks.onApply();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(f.requests.length, 1);
        assert.equal(last.pending, true);
        assert.equal(disposed, 0, '접수만으로 닫지 않음');
        assert.equal(results.length, 0, 'ACK 전 성공 결과 위조 금지');
        const result =
          outcome === 'unknown'
            ? null
            : {
                status:
                  outcome === 'rejected'
                    ? 'rejected-unapplied'
                    : outcome === 'noop-unpainted'
                      ? 'known-no-op'
                      : 'committed-with-snapshot',
                state: f.editor.getEditorState(),
                changed: outcome !== 'rejected' && outcome !== 'noop-unpainted',
                ...(outcome === 'rejected' ? { error: 'NativeRejected' } : {}),
              };
        finish({ result, current: outcome === 'success' });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(disposed, outcome === 'success' ? 1 : 0);
        if (outcome !== 'success') {
          assert.equal(last.canApply, false);
          callbacks.onApply();
          await new Promise((resolve) => setImmediate(resolve));
          assert.equal(f.requests.length, 1, '완료된 일회 캡처는 재접수하지 않음');
        }
        assert.equal(last.pending, outcome === 'success' ? true : false);
        if (result) {
          assert.equal(results[0], result, 'Core result identity 그대로 전달');
        } else {
          assert.equal(results.length, 0);
          assert.equal(last.error, 'SurfaceFormattingSettlementUnknown');
        }
      } finally {
        tool.dispose();
        await f.editor.dispose();
      }
    });

for (const allow of [true, false])
  test('대표 async prepare는 같은 캡처 사유만 갱신 ' + allow, async () => {
    const f = await setup();
    let callbacks,
      last,
      release,
      opened = 0,
      pending = true;
    const prepared = [];
    const get = f.host.captureSelectionFormatting;
    f.host.captureSelectionFormatting = () => {
      opened++;
      const cap = get();
      const reasons = cap.reasons;
      Object.defineProperty(cap, 'reasons', {
        get() {
          return {
            ...reasons,
            fontNamesAvailableReason: pending
              ? 'FormattingPreparing'
              : allow
                ? null
                : 'AtomicFontNamesUnavailable',
          };
        },
      });
      cap.prepare = (intent) => {
        prepared.push(intent);
        if (intent) return Promise.resolve(allow);
        return new Promise(
          (resolve) =>
            (release = () => {
              pending = false;
              resolve(true);
            }),
        );
      };
      return cap;
    };
    const editor = {
      getEditorState: () => f.editor.getEditorState(),
      registerStateListener: (fn) => f.editor.registerStateListener(fn),
      update: async () => {},
      dispatchCommand: () => assert.fail('single 위조'),
    };
    const tool = createFontNameTool({
      root: {},
      editor,
      getSurfaceFormattingHost: () => f.host,
      api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
      onStatus() {},
      onClose() {},
      createView: (_root, cb) => {
        callbacks = cb;
        return {
          getDialogElement: () => ({}),
          update(v) {
            last = v;
          },
          show() {},
          dispose() {},
          isComposing: () => false,
        };
      },
    });
    try {
      tool.open();
      assert.equal(last.canApply, false);
      release();
      await new Promise((resolve) => setImmediate(resolve));
      callbacks.onInput('대표 준비 글꼴');
      assert.equal(last.canApply, allow);
      callbacks.onApply();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(opened, 1, '권한 준비 뒤 새 범위를 캡처하지 않음');
      assert.equal(f.requests.length, allow ? 1 : 0);
      assert.equal(prepared.length, allow ? 2 : 1);
      if (allow) assert.equal(prepared[1].kind, 'font-names');
    } finally {
      tool.dispose();
      await f.editor.dispose();
    }
  });

for (const kind of ['color', 'font'])
  test('비동기 prepare 뒤 ' + kind + ' view 오류는 UI오류로 소비', async () => {
    const f = await setup();
    let release,
      throwView = false;
    const errors = [];
    const get = f.host.captureSelectionFormatting;
    f.host.captureSelectionFormatting = () => ({
      ...get(),
      prepare: () => new Promise((resolve) => (release = resolve)),
    });
    const options = {
      root: {},
      editor: f.editor,
      getSurfaceFormattingHost: () => f.host,
      onStatus() {},
      onClose() {},
      onPresentationChange() {},
      onUIError: (error) => errors.push(error),
      createView: () => ({
        getDialogElement: () => ({}),
        update() {
          if (throwView) throw Error('ViewAfterPrepare');
        },
        show() {},
        dispose() {},
        isComposing: () => false,
      }),
    };
    const tool =
      kind === 'color'
        ? createTextColorTool(options)
        : createFontNameTool({
            ...options,
            api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
          });
    try {
      if (kind === 'color') tool.action('text-color');
      else tool.open('hangul');
      throwView = true;
      release(true);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, 'ViewAfterPrepare');
      assert.equal(f.requests.length, 0);
    } finally {
      throwView = false;
      tool.dispose();
      await f.editor.dispose();
    }
  });

test('공유 command-only validator는 기존 모든 허용 메뉴를 discriminant 그대로 보존', () => {
  for (const command of DEMO_COMMANDS) {
    const action = demoCommandAction(command);
    if (['set-font-size', 'set-zoom'].includes(command)) assert.equal(action, null);
    else assert.deepEqual(action, { command });
  }
});
test('공유 validator는 알수없는 명령과 숫자 payload 없는 명령을 거부', () => {
  for (const command of ['unknown', '', 'set-font-size', 'set-zoom', 'font-name:hangul'])
    assert.equal(demoCommandAction(command), null);
  assert.deepEqual(demoCommandAction('font-name'), { command: 'font-name' });
  assert.deepEqual(demoCommandAction('character-properties'), { command: 'character-properties' });
});
test('clipboard conditional은 기존 초기 capture→Coreupdate→transfer 순서를 보존', async () => {
  const f = await setup(),
    order = [];
  let capture = 0;
  const surface = {
    canTransferSelection: () => true,
    captureTransferSelection() {
      capture++;
      order.push('capture');
      return async () => {
        order.push('transfer');
        return true;
      };
    },
  };
  const editor = {
    getEditorState: () => f.editor.getEditorState(),
    update: async () => {
      order.push('update');
    },
    dispatchCommand: () => assert.fail('범위는 Core single로 위조하지 않음'),
  };
  const tool = createClipboardBridge({
    editor,
    getSurface: () => surface,
    clipboard: { writeText: async () => {} },
    onStatus() {},
  });
  try {
    assert.equal(await tool.action({ command: 'copy' }), true);
    assert.equal(capture, 1);
    assert.deepEqual(order, ['capture', 'update', 'transfer']);
  } finally {
    tool.dispose();
    await f.editor.dispose();
  }
});
test('clipboard 선택/포트 미관측은 false 분기에서 전송과 Coreupdate를 하지 않음', async () => {
  const f = await setup();
  let updates = 0;
  const tool = createClipboardBridge({
    editor: {
      getEditorState: () => f.editor.getEditorState(),
      update: async () => {
        updates++;
      },
      dispatchCommand: () => assert.fail('dispatch'),
    },
    getSurface: () => undefined,
    clipboard: { writeText: async () => assert.fail('write') },
    onStatus() {},
  });
  try {
    await tool.action({ command: 'copy' });
    assert.equal(updates, 0);
  } finally {
    tool.dispose();
    await f.editor.dispose();
  }
});

for (const kind of ['color', 'font'])
  for (const change of ['public-selection', 'canvas-same-state'])
    test('완료 콜백 뒤 ' + kind + ' ' + change + ' 포커스 이전 범위 재사용 거부', async () => {
      const f = await setup();
      let state = f.editor.getEditorState(),
        callbacks,
        focus = 0;
      const editor = {
        getEditorState: () => state,
        registerStateListener: (fn) => f.editor.registerStateListener(fn),
        update: async () => {},
        dispatchCommand: () => assert.fail('단일 target 위조 금지'),
      };
      const options = {
        root: {},
        editor,
        getSurfaceFormattingHost: () => f.host,
        onStatus() {},
        onPresentationChange() {},
        onClose() {
          focus++;
        },
        onResult() {
          if (change === 'public-selection') state = { ...state, selection: { changed: true } };
          else f.change();
        },
        createView: (_root, cb) => {
          callbacks = cb;
          return {
            getDialogElement: () => ({}),
            update() {},
            show() {},
            dispose() {},
            isComposing: () => false,
          };
        },
      };
      const tool =
        kind === 'color'
          ? createTextColorTool(options)
          : createFontNameTool({
              ...options,
              api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
            });
      try {
        if (kind === 'color') tool.action('text-color');
        else tool.open('hangul');
        await new Promise((resolve) => setImmediate(resolve));
        callbacks.onInput(kind === 'color' ? '#abcdef' : '다른 글꼴');
        callbacks.onApply();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(f.requests.length, 1);
        assert.equal(focus, 0, '완료 이전 캡처로 새 선택의 포커스를 복귀시키지 않음');
      } finally {
        tool.dispose();
        await f.editor.dispose();
      }
    });

for (const mode of [
  'current',
  'stale',
  'callback-selection',
  'callback-canvas',
  'disposed',
  'rejected',
  'unknown',
])
  test('크기 Apply ACK 뒤 포커스 ' + mode, async () => {
    const f = await setup();
    let state = f.editor.getEditorState(),
      finish,
      focused = 0,
      resultCalls = 0;
    const get = f.host.captureSelectionFormatting;
    f.host.captureSelectionFormatting = () => ({
      ...get(),
      settle: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    let bridge;
    bridge = createFormattingBridge({
      editor: {
        getEditorState: () => state,
        update: async () => {},
        dispatchCommand: () => assert.fail('단일 Core target 위조 금지'),
      },
      getSurfaceFormattingHost: () => f.host,
      onStatus() {},
      onResult() {
        resultCalls++;
        if (mode === 'callback-selection') state = { ...state, selection: { changed: true } };
        if (mode === 'callback-canvas') f.change();
      },
      onFocus() {
        focused++;
      },
    });
    try {
      const action = bridge.action({ command: 'set-font-size', points: 20 });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(f.requests.length, 1);
      assert.equal(focused, 0, 'ACK 전 focus 금지');
      assert.equal(
        bridge.getPresentation().actions['set-font-size'].enabled,
        false,
        '실제 완료 전 중복 접수 거부',
      );
      if (mode === 'disposed') bridge.dispose();
      const result =
        mode === 'unknown'
          ? null
          : {
              status: mode === 'rejected' ? 'rejected-unapplied' : 'committed-with-snapshot',
              state,
              changed: mode !== 'rejected',
              ...(mode === 'rejected' ? { error: 'NativeRejected' } : {}),
            };
      finish({ result, current: mode !== 'stale' });
      await action;
      assert.equal(focused, mode === 'current' ? 1 : 0);
      assert.equal(resultCalls, mode === 'disposed' || mode === 'unknown' ? 0 : 1);
      assert.equal(f.requests.length, 1);
    } finally {
      bridge.dispose?.();
      await f.editor.dispose();
    }
  });

for (const phase of ['update', 'prepare'])
  for (const failure of [false, true])
    test('범위 서식 ' + phase + ' 대기 중 dispose 후 늦은 표시 거부 ' + failure, async () => {
      const f = await setup();
      let resolve,
        reject,
        status = 0,
        focus = 0;
      const wait = new Promise((ok, bad) => {
        resolve = ok;
        reject = bad;
      });
      const get = f.host.captureSelectionFormatting;
      if (phase === 'prepare')
        f.host.captureSelectionFormatting = () => ({ ...get(), prepare: () => wait });
      const bridge = createFormattingBridge({
        editor: {
          getEditorState: () => f.editor.getEditorState(),
          update: () => (phase === 'update' ? wait : Promise.resolve()),
          dispatchCommand: () => assert.fail('Core 단일 target 위조 금지'),
        },
        getSurfaceFormattingHost: () => f.host,
        onStatus() {
          status++;
        },
        onFocus() {
          focus++;
        },
      });
      try {
        const action = bridge.action({ command: 'set-font-size', points: 20 });
        await new Promise((ok) => setImmediate(ok));
        bridge.dispose();
        if (failure) reject(Error('controlled-late'));
        else resolve(true);
        await action;
        assert.equal(status, 0);
        assert.equal(focus, 0);
        assert.equal(f.requests.length, 0);
      } finally {
        bridge.dispose();
        await f.editor.dispose();
      }
    });
