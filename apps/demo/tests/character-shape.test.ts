import { test, expect } from 'bun:test';
import {
  getSelectionFormatting,
  APPLY_FORMATTING_PATCH_COMMAND,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  SET_CHARACTER_FONT_NAME_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_CHARACTER_STRIKE_COMMAND,
} from '@hwpjs/core';
import { createCharacterShapePort, characterShapePlan } from '../src/character-shape-port.ts';
import { createCharacterShapeTool } from '../src/character-shape-tool.ts';
import { createFormattingDialogController } from '../src/formatting-dialog-controller.ts';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
// @ts-ignore Same canonical language order as the product.
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
const tick = () => new Promise<void>((r) => setImmediate(r));
function fixtureState(options: Record<string, any> = {}) {
  const token = {
    editorId: 'character',
    documentId: options.doc ?? 'doc',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  return {
    ...token,
    token,
    status: 'ready',
    stateVersion: options.version ?? 1,
    selection: {
      ...token,
      coordinateSpace: 'display',
      format: 'hwpx',
      owner: 'section:0:body',
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: options.caret ? 0 : 2,
      affinity: 'forward',
    },
    content: {
      format: 'hwpx',
      readOnly: !!options.readonly,
      characterPropertiesAvailable: !options.unsupported,
      paragraphAlignmentAvailable: true,
      characterUnderlineAvailable: !options.unsupported,
      characterStrikeAvailable: !options.unsupported,
      characterTextColorAvailable: !options.unsupported,
      characterFontNameAvailable: !options.unsupported,
      characterShapes: [
        { id: 0, height: 1200, bold: true, italic: false },
        { id: 1, height: 1400, bold: false, italic: true },
      ],
      characterUnderlines: [
        { id: 0, kind: 'top' },
        { id: 1, kind: 'none' },
      ],
      characterStrikes: [
        { id: 0, enabled: false },
        { id: 1, enabled: true },
      ],
      characterTextColors: [
        { id: 0, color: options.unknown ? null : 0x123456 },
        { id: 1, color: 0xabcdef },
      ],
      fontFaces: FONT_LANGUAGES.map((language: string) => ({
        language,
        id: 0,
        name: '원본 ' + language,
      })),
      characterFontReferences: [
        { id: 0, fontIds: FONT_LANGUAGES.map(() => 0) },
        { id: 1, fontIds: FONT_LANGUAGES.map(() => 0) },
      ],
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: 'AB',
          editable: !options.readonly,
          selectionOwner: 'section:0:body',
          paragraphShape: { alignment: 1 },
          characterRanges: options.mixed
            ? [
                { start: 0, end: 1, charShapeId: 0 },
                { start: 1, end: 2, charShapeId: 1 },
              ]
            : [{ start: 0, end: 2, charShapeId: 0 }],
        },
      ],
    },
  } as any;
}
function setup(options: Record<string, any> = {}) {
  const dom = documentFixture(),
    calls: any[] = [],
    listeners = new Set<(s: any) => void>();
  let current = fixtureState(options),
    focus = 0,
    presentations = 0;
  const editor: any = {
    getEditorState: () => current,
    update: async () => {
      await options.barrier?.();
    },
    dispatchCommand: async (command: any, payload: any) => {
      calls.push({ command, payload });
      return options.dispatch
        ? options.dispatch()
        : { status: 'committed-with-snapshot', changed: true, state: current };
    },
  };
  const port = createCharacterShapePort(editor),
    tool = createCharacterShapeTool({
      root: dom.root as any,
      port,
      getState: () => current,
      subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      onStatus: () => {},
      onClose: () => {
        focus++;
      },
      onPresentationChange: () => {
        presentations++;
      },
    });
  const input = (role: string, value: string, type = 'input') => {
    dom.role(role).value = value;
    fire(dom.role(role), type);
  };
  const key = (key: string, role: string, values: Record<string, unknown> = {}) => {
    const e = new Event('keydown', { cancelable: true });
    Object.defineProperty(e, 'target', { value: dom.role(role) });
    Object.assign(e, { key, keyCode: key === 'Enter' ? 13 : 0, ...values });
    dom.role('character-shape').dispatchEvent(e);
    return e;
  };
  return {
    ...dom,
    port,
    tool,
    calls,
    input,
    key,
    editor,
    open: () => tool.action('character-properties'),
    publish: (o: any) => {
      current = fixtureState(o);
      for (const fn of listeners) fn(current);
    },
    state: () => current,
    subscribe(fn: (state: any) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get focus() {
      return focus;
    },
    get presentations() {
      return presentations;
    },
  };
}
test('원본 조회와 미확인 색·혼합·미지원은 임의 기본값 없이 표시한다', () => {
  for (const o of [
    { unknown: true },
    { mixed: true },
    { unsupported: true },
    { readonly: true },
    { caret: true },
  ]) {
    const f = setup(o);
    f.open();
    expect(f.role('character-color').value).toBe('');
    expect(f.role('character-unavailable-field').disabled).toBe(true);
    if (o.readonly || o.caret || o.unsupported)
      expect(f.role('character-size').disabled).toBe(true);
    if (o.mixed) expect(f.role('character-size').value).toBe('');
    f.tool.dispose();
  }
});
test('기본3속성은 같은 공개 명령 한 번에 전달하고 취소하면 쓰기0이다', async () => {
  const f = setup();
  f.open();
  f.input('character-size', '24');
  f.input('character-bold', 'false', 'change');
  f.input('character-italic', 'true', 'change');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].command).toBe(SET_CHARACTER_PROPERTIES_COMMAND);
  expect(f.calls[0].payload.properties).toEqual({ size: 2400, bold: false, italic: true });
  expect(f.focus).toBe(1);
  f.open();
  f.input('character-size', '20');
  fire(f.role('character-cancel'), 'click');
  expect(f.calls.length).toBe(1);
  f.open();
  expect(f.role('character-size').value).toBe('12');
  f.tool.dispose();
});
test('색과 글꼴은 기존 명령·검증을 재사용하고 원본 이름을 정규화하지 않는다', async () => {
  for (const kind of ['color', 'font']) {
    const f = setup();
    f.open();
    if (kind === 'color') f.input('character-color', '#ABCDEF');
    else {
      f.input('character-font-language', 'hangul', 'change');
      f.input('character-font-name', ' 이름 ');
    }
    fire(f.role('character-confirm'), 'click');
    await tick();
    expect(f.calls.length).toBe(1);
    expect(f.calls[0].command).toBe(
      kind === 'color' ? SET_CHARACTER_TEXT_COLOR_COMMAND : SET_CHARACTER_FONT_NAME_COMMAND,
    );
    if (kind === 'color') expect(f.calls[0].payload.color).toBe('#abcdef');
    else expect(f.calls[0].payload).toMatchObject({ language: 'hangul', name: ' 이름 ' });
    f.tool.dispose();
  }
});
test('둘 이상의 명령군은 확인 거부·초안 보존이며 여러 setter로 분해하지 않는다', async () => {
  const f = setup();
  f.open();
  f.input('character-size', '24');
  f.input('character-color', '#abcdef');
  expect(f.role('character-confirm').disabled).toBe(true);
  expect(f.text()).toContain('동시 적용');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(0);
  expect(f.role('character-size').value).toBe('24');
  expect(f.role('character-color').value).toBe('#abcdef');
  f.input('character-color', '');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  f.tool.dispose();
});
test('동일한 기본값·색·이름은 변경분에서 제외하고 없는 필드는 전송하지 않는다', () => {
  const f = setup(),
    o = f.port.capture();
  expect(
    characterShapePlan(o, {
      properties: { size: 1200, bold: true },
      color: '#123456',
      font: { language: 'hangul', name: '원본 hangul' },
    }).group,
  ).toBeNull();
  expect(characterShapePlan(o, { properties: { size: 1200 }, color: '#abcdef' }).group).toBe(
    'color',
  );
  f.tool.dispose();
});
test('밑줄 Boolean에서 위치를 추정하지 않으며 취소선은 별도 Boolean 명령이다', async () => {
  for (const [draft, command] of [
    [{ underline: 'bottom' }, SET_CHARACTER_UNDERLINE_COMMAND],
    [{ strike: true }, SET_CHARACTER_STRIKE_COMMAND],
  ] as const) {
    const f = setup(),
      o = f.port.capture();
    expect(o.formatting.underline).toBe(true);
    const r = await f.port.apply(o, draft, () => true);
    expect(r.kind).toBe('command');
    expect(f.calls[0].command).toBe(command);
    f.tool.dispose();
  }
  const f = setup();
  expect(() => characterShapePlan(f.port.capture(), { underline: 'top' } as any)).toThrow(
    'IntegratedUnderlineKindUnavailable',
  );
  f.tool.dispose();
});
test('unknown 원본색의 명시교체는 기존 availability를 따르고 미지원은 거부한다', async () => {
  const f = setup({ unknown: true }),
    o = f.port.capture();
  expect(getSelectionFormatting(f.state()).textColor).toBeNull();
  expect(o.formatting.textColorAvailableReason).toBeNull();
  expect((await f.port.apply(o, { color: '#abcdef' }, () => true)).kind).toBe('command');
  f.tool.dispose();
  const g = setup({ unsupported: true });
  expect((await g.port.apply(g.port.capture(), { color: '#abcdef' }, () => true)).kind).toBe(
    'rejected',
  );
  expect(g.calls.length).toBe(0);
  g.tool.dispose();
});
test('새 문서·선택 변경은 오래된 초안 접수와 새 문서 포커스 강탈을 막는다', async () => {
  const f = setup();
  f.open();
  f.input('character-size', '24');
  f.publish({ version: 2 });
  expect(f.role('character-confirm').disabled).toBe(true);
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(0);
  f.publish({ doc: 'replacement' });
  expect(f.role('character-shape')).toBeUndefined();
  expect(f.focus).toBe(0);
  f.tool.dispose();
});
test('대기열 flush 사이 문서 변경과 폐기는 dispatch0·늦은 focus0이다', async () => {
  for (const dispose of [false, true]) {
    let release!: () => void;
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    const f = setup({ barrier: () => barrier });
    f.open();
    f.input('character-size', '24');
    fire(f.role('character-confirm'), 'click');
    if (dispose) f.tool.dispose();
    else f.publish({ doc: 'new' });
    release();
    await tick();
    expect(f.calls.length).toBe(0);
    expect(f.focus).toBe(0);
    f.tool.dispose();
  }
});
test('이미 반영된 refresh-required 오류는 재확인으로 중복 전송하지 않는다', async () => {
  const f = setup({
    dispatch: () => ({
      status: 'committed-refresh-required',
      changed: true,
      error: 'ProjectionFailed',
    }),
  });
  f.open();
  f.input('character-color', '#abcdef');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.role('character-confirm').disabled).toBe(true);
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.text()).toContain('이미 반영');
  f.tool.dispose();
});
test('Enter·취소·재열기·229·조합 중 Escape는 실제 view 분기에서 검증한다', async () => {
  const f = setup();
  f.open();
  f.input('character-size', '24');
  f.key('Enter', 'character-size', { keyCode: 229 });
  expect(f.calls.length).toBe(0);
  fire(f.role('character-shape'), 'keyup');
  fire(f.role('character-shape'), 'compositionstart');
  f.key('Enter', 'character-size');
  f.key('Escape', 'character-size');
  expect(f.role('character-shape')).toBeDefined();
  expect(f.calls.length).toBe(0);
  fire(f.role('character-shape'), 'compositionend');
  f.key('Enter', 'character-size');
  await tick();
  expect(f.calls.length).toBe(1);
  f.open();
  expect(f.role('character-size').value).toBe('12');
  f.tool.dispose();
});
test('탭의 방향키도 조합/229를 보존하며 기존 공통 Tab 트랩을 재사용한다', () => {
  const f = setup();
  f.open();
  const basic = f.role('character-tab-0');
  fire(basic, 'keydown', { key: 'ArrowRight', keyCode: 229 });
  expect(basic.getAttribute('aria-selected')).toBe('true');
  fire(basic, 'keydown', { key: 'ArrowRight', keyCode: 39 });
  expect(f.role('character-tab-1').getAttribute('aria-selected')).toBe('true');
  const cancel = f.role('character-cancel');
  cancel.focus();
  const e = f.key('Tab', 'character-cancel');
  expect(e.defaultPrevented).toBe(true);
  expect(f.doc.activeElement).toBeDefined();
  f.tool.dispose();
});
test('언어 전환은 작성 중인 다른 언어 초안을 조용히 버리지 않는다', () => {
  const f = setup();
  f.open();
  f.input('character-font-language', 'hangul', 'change');
  f.input('character-font-name', '새 이름');
  f.input('character-font-language', 'latin', 'change');
  expect(f.role('character-font-language').value).toBe('hangul');
  expect(f.role('character-font-name').value).toBe('새 이름');
  fire(f.role('character-font-keep'), 'click');
  f.input('character-font-language', 'latin', 'change');
  expect(f.role('character-font-language').value).toBe('latin');
  f.tool.dispose();
});
test('잘못된 값·알 수 없는 키·허용되지 않은 원본 권한은 명시 거부한다', () => {
  const f = setup();
  for (const draft of [
    { properties: { size: NaN } },
    { properties: { bold: 'true' } },
    { color: 'red' },
    { font: { language: 'unknown', name: 'a' } },
    { ratio: 90 },
  ])
    expect(f.port.assess(f.port.capture(), draft as any)).not.toBeNull();
  f.tool.dispose();
  const g = setup({ readonly: true });
  expect(g.port.assess(g.port.capture(), { strike: true })).toBe('SelectionNotEditable');
  g.tool.dispose();
});
test('공통 controller는 선택한 글자 port만 위임하고 문단 창과 동시 표시하지 않는다', async () => {
  const f = setup();
  f.tool.dispose();
  const bridge = createFormattingBridge({ editor: f.editor, onStatus: () => {} });
  const controller = createFormattingDialogController({
    root: f.root as any,
    port: bridge,
    characterPort: f.port,
    getState: f.state,
    subscribe: f.subscribe,
    onStatus: () => {},
  });
  controller.action({ command: 'character-properties' });
  expect(f.role('character-shape')).toBeDefined();
  expect(controller.presentation()['paragraph-properties']!.enabled).toBe(false);
  controller.action({ command: 'paragraph-properties' });
  expect(f.role('formatting-dialog')).toBeUndefined();
  f.input('character-color', '#abcdef');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].command).toBe(SET_CHARACTER_TEXT_COLOR_COMMAND);
  controller.dispose();
  expect(f.role('character-shape')).toBeUndefined();
});
test('확인 접수 후 닫기는 가짜 취소가 아니며 폐기 후 늦은 결과는 포커스를 가져오지 않는다', async () => {
  let release!: (value: any) => void;
  const pending = new Promise<any>((resolve) => {
    release = resolve;
  });
  const f = setup({ dispatch: () => pending });
  f.open();
  f.input('character-size', '24');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.role('character-cancel').disabled).toBe(true);
  f.key('Escape', 'character-size');
  expect(f.role('character-shape')).toBeDefined();
  f.tool.dispose();
  const afterDispose = f.presentations;
  release({ status: 'committed-with-snapshot', changed: true });
  await tick();
  expect(f.focus).toBe(0);
  expect(f.presentations).toBe(afterDispose);
});

function enableAtomic(
  f: ReturnType<typeof setup>,
  options: { unsupported?: boolean; wrongBinding?: boolean } = {},
) {
  const binding = { session: 'unit-native', revision: 0 };
  f.editor.getFormattingCapabilities = async () =>
    options.unsupported
      ? { atomic: false, reason: 'UnsupportedAtomicRuntime' }
      : {
          atomic: true,
          selectionAdmissionFence: {
            version: 1,
            epoch: 'stateVersion',
            commands: ['APPLY_FORMATTING_PATCH'],
          },
          binding,
          fields: {
            'character.bold': { readable: true, writable: true },
            'character.textColor': { readable: true, writable: true },
          },
        };
  f.editor.queryFormatting = async () => ({
    binding: options.wrongBinding ? { ...binding, revision: 1 } : binding,
    observations: { aggregate: {}, perTarget: [] },
    targets: [],
  });
}
test('지원 엔진의 기본속성·색 UI 변경은 selection fence를 가진 원자 명령 하나다', async () => {
  const f = setup();
  enableAtomic(f);
  f.open();
  await tick();
  f.input('character-size', '24');
  f.input('character-color', '#abcdef');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].command).toBe(APPLY_FORMATTING_PATCH_COMMAND);
  expect(f.calls[0].payload.patch.character).toEqual({ size: 2400, textColor: 0xabcdef });
  expect(f.calls[0].payload.selectionVersion).toBe(f.state().stateVersion);
  f.tool.dispose();
});
test('atomic 전체 의도도 동일 포트로 한 번만 전송하며 구 엔진에는 허용하지 않는다', async () => {
  for (const unsupported of [false, true]) {
    const f = setup();
    enableAtomic(f, { unsupported });
    const o = f.port.capture();
    await f.port.prepare(o);
    const result = await f.port.apply(
      o,
      {
        atomic: {
          ratio: { hangul: 120 },
          charSpacing: { latin: -5 },
          underline: { kind: 'bottom', style: 'DOT' },
        },
      },
      () => true,
    );
    expect(f.calls.length).toBe(unsupported ? 0 : 1);
    expect(result.kind).toBe(unsupported ? 'rejected' : 'command');
    f.tool.dispose();
  }
});
test('cap와 query binding이 다르면 창의 확인을 막고 기존 setter로 우회하지 않는다', async () => {
  const f = setup();
  enableAtomic(f, { wrongBinding: true });
  f.open();
  await tick();
  expect(f.role('character-confirm').disabled).toBe(true);
  expect(f.text()).toContain('StaleFormattingBinding');
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
});
test('reset과 다른 초안을 섞어 조용히 버리지 않는다', async () => {
  const f = setup();
  enableAtomic(f);
  const o = f.port.capture();
  await f.port.prepare(o);
  const r = await f.port.apply(
    o,
    { reset: { basis: 'paragraph-style', scope: 'character' }, properties: { bold: false } },
    () => true,
  );
  expect(r.kind).toBe('rejected');
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
});

function atomicFields(f: ReturnType<typeof setup>) {
  const fields = [
    'character.ratio',
    'character.charSpacing',
    'character.relativeSize',
    'character.offset',
    'character.underline.style',
    'character.underline.color',
    'character.strike.style',
    'character.strike.color',
    'character.shadow.kind',
    'character.shadow.offsetX',
    'character.shadow.offsetY',
    'character.shadow.color',
    'character.border',
    'character.background',
    'reset.style',
  ];
  const binding = { session: 'unit-fields', revision: 0 };
  f.editor.getFormattingCapabilities = async () => ({
    atomic: true,
    selectionAdmissionFence: {
      version: 1,
      epoch: 'stateVersion',
      commands: ['APPLY_FORMATTING_PATCH'],
    },
    binding,
    fields: Object.fromEntries(
      fields.map((k) => [k, { readable: true, writable: true, enumValues: ['SOLID', 'DOT'] }]),
    ),
  });
  f.editor.queryFormatting = async () => ({
    binding,
    observations: {
      aggregate: Object.fromEntries(
        fields.map((k) => [k, { state: 'known', value: 0, writable: true }]),
      ),
      perTarget: [],
    },
    targets: [],
  });
}
for (const [key, value] of [
  ['ratio', '120'],
  ['charSpacing', '-5'],
  ['relativeSize', '90'],
  ['offset', '-4'],
])
  test('언어별 ' + key + ' 컨트롤을 원자 명령에 연결한다', async () => {
    const f = setup();
    atomicFields(f);
    f.open();
    await tick();
    f.input('character-atomic-' + key + '-hangul', value);
    fire(f.role('character-confirm'), 'click');
    await tick();
    expect(f.calls.length).toBe(1);
    expect(f.calls[0].payload.patch.character[key].hangul).toBe(Number(value));
    f.tool.dispose();
  });
test('그림자와 테두리·배경 컨트롤을 여러 setter로 분해하지 않는다', async () => {
  const f = setup();
  atomicFields(f);
  f.open();
  await tick();
  f.input('character-atomic-shadow-kind', 'drop', 'change');
  f.input('character-atomic-shadow-offsetX', '5');
  f.input('character-atomic-shadow-offsetY', '6');
  f.input('character-atomic-shadow-color', '#123456');
  f.input('character-atomic-border-left-color', '#abcdef');
  f.input('character-atomic-background-kind', 'solid', 'change');
  f.input('character-atomic-background-color', '#ffffff');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].command).toBe(APPLY_FORMATTING_PATCH_COMMAND);
  expect(f.calls[0].payload.patch.character.shadow).toEqual({
    kind: 'drop',
    offsetX: 5,
    offsetY: 6,
    color: 0x123456,
  });
  expect(f.calls[0].payload.patch.character.background).toEqual({ kind: 'solid', color: 0xffffff });
  f.tool.dispose();
});
test('명시 글자 reset과 변경 없는 확인의 쓰기를 구분한다', async () => {
  const f = setup();
  atomicFields(f);
  f.open();
  await tick();
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(0);
  f.open();
  await tick();
  fire(f.role('character-atomic-reset'), 'click');
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].payload.patch).toEqual({
    reset: { basis: 'paragraph-style', scope: 'character' },
  });
  f.tool.dispose();
});

test('명시 선택 fence가 없는 atomic 엔진은 확인 전에 이유를 반환한다', async () => {
  const f = setup();
  enableAtomic(f);
  const original = f.editor.getFormattingCapabilities;
  f.editor.getFormattingCapabilities = async () => ({
    ...(await original()),
    selectionAdmissionFence: undefined,
  });
  f.open();
  await tick();
  expect(f.role('character-confirm').disabled).toBe(true);
  expect(f.text()).toContain('SelectionFenceUnavailable');
  f.input('character-size', '24');
  expect(f.role('character-confirm').disabled).toBe(true);
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(0);
  f.tool.dispose();
});
test('읽기 불가 필드는 명시 조회 목록에 넣지 않고 binding-only 조회를 보존한다', async () => {
  const f = setup();
  enableAtomic(f);
  const original = f.editor.getFormattingCapabilities;
  f.editor.getFormattingCapabilities = async () => {
    const c = await original();
    return {
      ...c,
      fields: { ...c.fields, 'character.shadow': { readable: false, writable: false } },
    };
  };
  let requested: string[] = [];
  const query = f.editor.queryFormatting;
  f.editor.queryFormatting = async (t: any, o: any) => {
    requested = o.fields;
    return query(t, o);
  };
  const o = f.port.capture();
  await f.port.prepare(o);
  expect(requested).toEqual(['character.bold', 'character.textColor']);
  f.tool.dispose();
});
test('세부 색 입력 중간 문자열은 덮어쓰지 않고 불완전한 값은 확인을 막는다', async () => {
  const f = setup();
  atomicFields(f);
  f.open();
  await tick();
  for (const text of ['#', '#1', '#12', '#123', '#1234', '#12345']) {
    f.input('character-atomic-shadow-color', text);
    expect(f.role('character-atomic-shadow-color').value).toBe(text);
    expect(f.role('character-confirm').disabled).toBe(true);
  }
  f.input('character-atomic-shadow-color', '#123456');
  expect(f.role('character-confirm').disabled).toBe(false);
  f.tool.dispose();
});

test('atomic 초기 조회 오류는 초안 변경으로 legacy setter 우회되지 않는다', async () => {
  const f = setup();
  enableAtomic(f);
  f.editor.queryFormatting = async () => {
    throw Error('NativeQueryUnavailable');
  };
  f.open();
  await tick();
  f.input('character-color', '#abcdef');
  expect(f.role('character-confirm').disabled).toBe(true);
  fire(f.role('character-confirm'), 'click');
  await tick();
  expect(f.calls.length).toBe(0);
  expect(f.text()).toContain('NativeQueryUnavailable');
  f.tool.dispose();
});
