import { test, expect } from 'bun:test';
import { createParagraphShapeTool } from '../src/paragraph-shape-tool.ts';
import { createParagraphShapeApi, supportsParagraphShapeApi } from '../src/paragraph-shape-api.ts';
import { paragraphShapeFields } from '../src/paragraph-shape-port.ts';
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
function fixture() {
  const target = {
    editorId: 'unit',
    documentId: 'doc',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    coordinateSpace: 'display',
    format: 'hwp5',
    owner: 'unit-owner',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    affinity: 'forward',
  };
  let state: any = {
    status: 'ready',
    documentId: 'doc',
    generation: 1,
    stateVersion: 1,
    selection: target,
    token: {},
  };
  let listen: (state: any) => void = () => {},
    callbacks: any,
    externalModal = false;
  const calls: { capability: number; query: number; dispatch: any[]; issuer: any[] } = {
    capability: 0,
    query: 0,
    dispatch: [],
    issuer: [],
  };
  const command = { id: Symbol('apply-formatting-patch'), name: 'apply-formatting-patch' };
  const fields = { 'paragraph.alignment': { state: 'known', value: 'LEFT', writable: true } };
  const editor: any = {
    getEditorState: () => state,
    registerStateListener: (fn: (s: any) => void) => {
      listen = fn;
      return () => {
        listen = () => {};
      };
    },
    async getFormattingCapabilities() {
      expect(this).toBe(editor);
      calls.capability++;
      return {
        atomic: true,
        fields: { 'paragraph.alignment': { readable: true, writable: true } },
        selectionAdmissionFence: {
          version: 1,
          epoch: 'stateVersion',
          commands: ['APPLY_FORMATTING_PATCH'],
        },
      };
    },
    async queryFormatting(value: any) {
      expect(this).toBe(editor);
      expect(value).toBe(target);
      calls.query++;
      return { schemaVersion: 1, targets: [{}], observations: { aggregate: fields } };
    },
    async dispatchCommand(value: any, payload: any) {
      expect(this).toBe(editor);
      expect(value).toBe(command);
      calls.dispatch.push(payload);
      return { status: 'committed-with-snapshot' };
    },
  };
  const core: any = {
    APPLY_FORMATTING_PATCH_COMMAND: command,
    getSelectionFormatting: () => ({ target }),
    createParagraphSelection: (value: any, options: any) => {
      calls.issuer.push({ value, options });
      return target;
    },
  };
  const view: any = (_root: any, next: any) => {
    callbacks = next;
    return { update() {}, isComposing: () => false, dispose() {} };
  };
  let focusRestored = 0;
  const root = {
    ownerDocument: { querySelector: () => (externalModal ? {} : null) },
  } as unknown as HTMLElement;
  const tool = createParagraphShapeTool({
    root,
    editor,
    core,
    createView: view,
    onClose: () => {
      focusRestored++;
    },
  });
  return {
    editor,
    core,
    tool,
    calls,
    target,
    command,
    state: () => state,
    callbacks: () => callbacks,
    externalModal(value: boolean) {
      externalModal = value;
    },
    focusRestored: () => focusRestored,
    publish(value: any) {
      state = value;
      listen(value);
    },
  };
}
test('12개 field 이름은 API의 문단 범위이며 reset·character를 추가하지 않는다', () => {
  expect(paragraphShapeFields).toHaveLength(12);
  expect(new Set(paragraphShapeFields).size).toBe(12);
  expect(paragraphShapeFields.every((name) => name.startsWith('paragraph.'))).toBe(true);
  expect(paragraphShapeFields.some((name) => name.includes('reset'))).toBe(false);
});
test('presentation과 평소 state 갱신에는 cap/query가 없고 open에서만 각1회다', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) {
    f.tool.presentation();
    f.publish(f.state());
  }
  expect(f.calls.capability).toBe(0);
  expect(f.calls.query).toBe(0);
  expect(f.tool.action('paragraph-properties')).toBe(true);
  await settle();
  expect(f.calls.capability).toBe(1);
  expect(f.calls.query).toBe(1);
  f.publish(f.state());
  expect(f.calls.query).toBe(1);
  f.tool.dispose();
});
test('canonical 문단 선택 facade에 좌표만 전달하고 owner/ref를 발급하지 않는다', async () => {
  const f = fixture();
  f.tool.action('paragraph-properties');
  await settle();
  expect(f.calls.issuer).toHaveLength(1);
  expect(f.calls.issuer[0].value).toBe(f.state());
  expect(f.calls.issuer[0].options).toEqual({
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    affinity: 'forward',
  });
  f.tool.dispose();
});
test('확인1회는 같은 공개 command와 selectionVersion으로 patch1개만 전달한다', async () => {
  const f = fixture();
  f.tool.action('paragraph-properties');
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().apply();
  f.callbacks().apply();
  await settle();
  expect(f.calls.dispatch).toHaveLength(1);
  expect(f.calls.dispatch[0]).toEqual({
    target: f.target,
    selectionVersion: 1,
    patch: { paragraph: { alignment: 'RIGHT' } },
  });
  f.tool.dispose();
});
test('cancel은 dispatch0이며 기존 형식 toolbar 명령을 가로채지 않는다', async () => {
  const f = fixture();
  expect(f.tool.action('bold')).toBe(false);
  f.tool.action('paragraph-properties');
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().cancel();
  expect(f.calls.dispatch).toHaveLength(0);
  f.tool.dispose();
});
test('구 SDK에 새 export가 없으면 정적 import 없이 기존 paragraph 도구로 반환한다', () => {
  const f = fixture();
  expect(supportsParagraphShapeApi({}, {})).toBe(false);
  expect(() => createParagraphShapeApi({}, {})).toThrow('AtomicFormattingApiRequired');
  const old = createParagraphShapeTool({
    root: {} as HTMLElement,
    editor: f.editor,
    core: {},
    createView: (() => {
      throw Error('ShouldNotMount');
    }) as any,
  });
  expect(old.available).toBe(false);
  expect(old.action('paragraph-properties')).toBe(false);
  expect(f.calls.query).toBe(0);
  old.dispose();
  f.tool.dispose();
});

test('다른 모달이 열리면 문단 open은 cap/query/dispatch를 시작하지 않는다', async () => {
  const f = fixture();
  f.externalModal(true);
  expect(f.tool.presentation()).toEqual({ enabled: false, reason: 'FormattingDialogOpen' });
  expect(f.tool.action('paragraph-properties')).toBe(true);
  await settle();
  expect(f.calls.capability).toBe(0);
  expect(f.calls.query).toBe(0);
  expect(f.calls.dispatch).toHaveLength(0);
  expect(f.callbacks()).toBeUndefined();
  f.tool.dispose();
});
test('다른 모달이 닫히면 기존 문단 open을 한 번만 다시 허용한다', async () => {
  const f = fixture();
  f.externalModal(true);
  f.tool.action('paragraph-properties');
  f.externalModal(false);
  f.tool.action('paragraph-properties');
  await settle();
  expect(f.calls.capability).toBe(1);
  expect(f.calls.query).toBe(1);
  f.tool.dispose();
});
test('문단 취소 시 다른 모달이 있으면 본문으로 focus를 돌리지 않는다', async () => {
  const f = fixture();
  f.tool.action('paragraph-properties');
  await settle();
  f.externalModal(true);
  f.callbacks().cancel();
  expect(f.focusRestored()).toBe(0);
  expect(f.calls.dispatch).toHaveLength(0);
  f.tool.dispose();
});
