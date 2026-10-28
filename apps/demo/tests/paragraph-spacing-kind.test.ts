import { test, expect } from 'bun:test';
import { createParagraphShapeController } from '../src/paragraph-shape-controller.ts';
import { createParagraphShapeView } from '../src/paragraph-shape-view.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = async () => {
  for (let n = 0; n < 12; n++) await Promise.resolve();
};
function setup(
  options: {
    unit?: string;
    format?: string;
    kindWritable?: boolean;
    readonly?: boolean;
    mixed?: boolean;
    kind?: string;
    amount?: number;
    enums?: string[];
  } = {},
) {
  const dom = documentFixture();
  let state: any = {
    status: 'ready',
    documentId: 'a',
    generation: 1,
    stateVersion: 1,
    token: {},
    selection: {
      owner: 'section:0:body',
      format: options.format ?? 'hwpx',
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 0,
    },
  };
  let listener: (s: any) => void = () => {};
  const known = (value: unknown, unit?: string) => ({
    state: 'known',
    value,
    writable: !options.readonly,
    ...(unit ? { unit } : {}),
    ...(options.readonly ? { writeUnavailableReason: 'ReadOnlyDocument' } : {}),
  });
  const observations: any = {
    'paragraph.spacing.kind': options.mixed
      ? { state: 'mixed', writable: true }
      : known(options.kind ?? 'percent'),
    'paragraph.spacing.value': known(options.amount ?? 160, options.unit ?? 'percent'),
  };
  const fields = {
    'paragraph.spacing.kind': {
      readable: true,
      writable: !options.readonly && options.kindWritable !== false,
      enumValues: options.enums ?? ['percent', 'fixed', 'between', 'at_least'],
    },
    'paragraph.spacing.value': { readable: true, writable: !options.readonly },
  };
  const requests: any[] = [];
  let caps = 0,
    queries = 0;
  const api: any = {
    command: { id: Symbol(), name: 'apply-formatting-patch' },
    target: () => state.selection,
    capabilities: async () => {
      caps++;
      return {
        atomic: true,
        fields,
        selectionAdmissionFence: {
          version: 1,
          epoch: 'stateVersion',
          commands: ['APPLY_FORMATTING_PATCH'],
        },
      };
    },
    query: async () => {
      queries++;
      return { schemaVersion: 1, targets: [{}], observations: { aggregate: observations } };
    },
    dispatch: async (_: any, payload: any) => {
      requests.push(payload);
      return { status: 'committed-with-snapshot' };
    },
  };
  const controller = createParagraphShapeController({
    api,
    getState: () => state,
    subscribe(fn) {
      listener = fn;
      return () => {};
    },
    createView: (c) => createParagraphShapeView(dom.root as any, c),
  });
  const role = (name: string) => dom.role(name);
  const input = (name: string, value: string) => {
    role(name).value = value;
    fire(role(name), name === 'spacing-kind' ? 'change' : 'input');
  };
  return {
    ...dom,
    role,
    input,
    controller,
    requests,
    counters: () => ({ caps, queries }),
    stale() {
      state = { ...state, stateVersion: 2 };
      listener(state);
    },
    switchDocument() {
      state = { ...state, documentId: 'b', generation: 2 };
      listener(state);
    },
  };
}
async function open(options?: Parameters<typeof setup>[0]) {
  const f = setup(options);
  f.controller.open();
  await tick();
  return f;
}
test('지원된 종류는 활성화하고 숫자를 암묵 복사하지 않는다', async () => {
  const f = await open();
  expect(f.role('spacing-kind').disabled).toBe(false);
  f.input('spacing-kind', 'fixed');
  expect(f.role('spacing-value').value).toBe('');
  expect(f.role('paragraph-shape-apply').disabled).toBe(true);
  expect(f.requests.length).toBe(0);
  expect(f.counters()).toEqual({ caps: 1, queries: 1 });
  f.controller.dispose();
});
test('고정값 pt를 정확히 정수로 바꿔 종류와 한 원자 명령에 보낸다', async () => {
  const f = await open();
  f.input('spacing-kind', 'fixed');
  f.input('spacing-value', '6.25');
  fire(f.role('paragraph-shape-apply'), 'click');
  await tick();
  expect(f.requests.length).toBe(1);
  expect(f.requests[0].patch).toEqual({ paragraph: { spacing: { kind: 'fixed', value: 625 } } });
  expect(f.requests[0].selectionVersion).toBe(1);
  f.controller.dispose();
});
test('종류가 다르면 같은 원시 숫자도 명시 값으로 유지한다', async () => {
  const f = await open();
  f.input('spacing-kind', 'fixed');
  f.input('spacing-value', '1.6');
  fire(f.role('paragraph-shape-apply'), 'click');
  await tick();
  expect(f.requests[0]?.patch).toEqual({ paragraph: { spacing: { kind: 'fixed', value: 160 } } });
  f.controller.dispose();
});
test('종류를 되돌리면 이전 종류의 편집 숫자를 쓰지 않는다', async () => {
  const f = await open();
  f.input('spacing-kind', 'fixed');
  f.input('spacing-value', '6');
  f.input('spacing-kind', 'percent');
  expect(f.role('spacing-value').value).toBe('160');
  expect(f.role('paragraph-shape-apply').disabled).toBe(true);
  expect(f.requests.length).toBe(0);
  f.controller.dispose();
});
test('원본 단위를 모르면 종류와 값 모두 추정하지 않는다', async () => {
  const f = await open({ unit: 'hwp5-source-unit' });
  expect(f.role('spacing-kind').disabled).toBe(true);
  expect(f.role('spacing-value').disabled).toBe(true);
  f.controller.dispose();
});
test('종류 쓰기가 없더라도 기존 종류의 값 편집은 유지한다', async () => {
  const f = await open({ kindWritable: false });
  expect(f.role('spacing-kind').disabled).toBe(true);
  expect(f.role('spacing-value').disabled).toBe(false);
  f.input('spacing-value', '180');
  fire(f.role('paragraph-shape-apply'), 'click');
  await tick();
  expect(f.requests[0]?.patch).toEqual({ paragraph: { spacing: { kind: 'percent', value: 180 } } });
  f.controller.dispose();
});
test('혼합 종류와 읽기 전용에는 기본 종류를 만들지 않는다', async () => {
  for (const options of [{ mixed: true }, { readonly: true }]) {
    const f = await open(options);
    expect(f.role('spacing-kind').disabled).toBe(true);
    expect(f.role('spacing-value').disabled).toBe(true);
    f.controller.dispose();
  }
});
test('정수 단위로 표현할 수 없는 소수는 반올림하지 않는다', async () => {
  const f = await open();
  f.input('spacing-kind', 'fixed');
  f.input('spacing-value', '1.234');
  expect(f.role('paragraph-shape-apply').disabled).toBe(true);
  expect(f.requests.length).toBe(0);
  f.controller.dispose();
});
test('조합 중 값 변경과 Enter는 쓰기를 접수하지 않는다', async () => {
  const f = await open();
  fire(f.role('paragraph-shape-dialog'), 'compositionstart');
  f.input('spacing-kind', 'fixed');
  fire(f.role('paragraph-shape-dialog'), 'keydown', { key: 'Enter', keyCode: 229 });
  expect(f.requests.length).toBe(0);
  expect(f.role('paragraph-shape-apply').disabled).toBe(true);
  f.controller.dispose();
});
test('선택 상태 변경과 문서 교체는 기존 admission을 되살리지 않는다', async () => {
  const f = await open();
  f.input('spacing-kind', 'fixed');
  f.input('spacing-value', '6');
  f.stale();
  expect(f.role('paragraph-shape-apply').disabled).toBe(true);
  expect(f.role('spacing-kind').disabled).toBe(true);
  f.switchDocument();
  expect(f.requests.length).toBe(0);
  f.controller.dispose();
});
test('취소 후 재열기는 변경하지 않은 원본 종류와 값을 보여준다', async () => {
  const f = await open();
  f.input('spacing-kind', 'fixed');
  f.input('spacing-value', '6');
  fire(f.role('paragraph-shape-cancel'), 'click');
  f.controller.open();
  await tick();
  expect(f.role('spacing-kind').value).toBe('percent');
  expect(f.role('spacing-value').value).toBe('160');
  expect(f.requests.length).toBe(0);
  f.controller.dispose();
});

for (const kind of ['between', 'at_least'])
  test('명시 ' + kind + ' 종류와 값을 같은 patch로 보낸다', async () => {
    const f = await open();
    f.input('spacing-kind', kind);
    f.input('spacing-value', '6.25');
    fire(f.role('paragraph-shape-apply'), 'click');
    await tick();
    expect(f.requests[0]?.patch).toEqual({ paragraph: { spacing: { kind, value: 625 } } });
    f.controller.dispose();
  });
test('HWPUNIT 원본에서 percent 전환도 이전 숫자를 비우고 명시 비율로 보낸다', async () => {
  const f = await open({ kind: 'fixed', amount: 1600, unit: 'HWPUNIT' });
  expect(f.role('spacing-value').value).toBe('16');
  f.input('spacing-kind', 'percent');
  expect(f.role('spacing-value').value).toBe('');
  f.input('spacing-value', '175');
  fire(f.role('paragraph-shape-apply'), 'click');
  await tick();
  expect(f.requests[0]?.patch).toEqual({ paragraph: { spacing: { kind: 'percent', value: 175 } } });
  f.controller.dispose();
});
test('capability enum에 없는 종류는 선택 항목도 비활성화한다', async () => {
  const f = await open({ enums: ['percent'] });
  const options = f.role('spacing-kind').children;
  expect(options.find((x) => x.value === 'fixed')?.disabled).toBe(true);
  expect(options.find((x) => x.value === 'percent')?.disabled).toBe(false);
  f.controller.dispose();
});

test('HWP5 종류 전환은 환산 미지원으로 막되 기존 percent 값 편집은 유지한다', async () => {
  const f = await open({ format: 'hwp5' });
  expect(f.role('spacing-kind').disabled).toBe(true);
  expect(f.role('spacing-value').disabled).toBe(false);
  f.input('spacing-value', '180');
  fire(f.role('paragraph-shape-apply'), 'click');
  await tick();
  expect(f.requests[0]?.patch).toEqual({ paragraph: { spacing: { kind: 'percent', value: 180 } } });
  f.controller.dispose();
});
