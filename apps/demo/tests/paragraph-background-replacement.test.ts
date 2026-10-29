import { test, expect } from 'bun:test';
import {
  backgroundReplacementAvailability as available,
  completeBackgroundReplacementDraft as draft,
  backgroundReplacementWireValue as wire,
} from '../src/paragraph-background-replacement.ts';
import { invalidResourceDraft } from '../src/paragraph-resource-input.ts';
const raw = () => ({
  kind: 'solid',
  faceColor: '#000000',
  hatchColor: '#123456',
  hatchStyle: 'HORIZONTAL',
  linear: {
    endColor: '#ffffff',
    angle: '0',
    centerX: '0',
    centerY: '100',
    step: '2',
    stepCenter: '50',
  },
});
function captured(): any {
  return {
    state: { status: 'ready' },
    target: { format: 'hwpx', owner: 'section:0:body' },
    capabilities: {
      atomic: true,
      schemaVersion: 1,
      requiresHistoryProtocol: 2,
      binding: { session: 'one', revision: 0 },
      fields: { 'paragraph.background': { readable: true, writable: true } },
    },
    result: {
      schemaVersion: 1,
      binding: { session: 'one', revision: 0 },
      targets: [{ ref: 'native-ref' }],
      observations: {
        aggregate: {
          'paragraph.background': {
            state: 'unknown',
            writable: false,
            reason: 'UnknownBorderFillValue',
            writeUnavailableReason: 'UnknownSourceValue',
          },
        },
      },
    },
  };
}
function complete(value = raw()) {
  const x = draft(value);
  if (invalidResourceDraft(x)) throw Error(x.reason);
  return x;
}
test('단색 전체 교체는 보조색도 명시하고 RGB0을 보존', () =>
  expect(wire(complete())).toEqual({ kind: 'solid', color: 0, hatchColor: 0x123456 }));
test('단색 보조색 생략은 원상속으로 가장하지 않고 invalid', () => {
  expect(invalidResourceDraft(draft({ ...raw(), hatchColor: '' }))).toBe(true);
  expect(invalidResourceDraft(draft({ ...raw(), hatchColor: undefined } as any))).toBe(true);
});
test('none 무늬 선형은 기존 canonical parser를 사용', () => {
  expect(wire(complete({ ...raw(), kind: 'none' }))).toEqual({ kind: 'none' });
  expect(wire(complete({ ...raw(), kind: 'hatch' }))).toEqual({
    kind: 'hatch',
    faceColor: 0,
    hatchColor: 0x123456,
    style: 'HORIZONTAL',
  });
  expect(wire(complete({ ...raw(), kind: 'linear' }))).toEqual({
    kind: 'linear',
    colors: [0, 0xffffff],
    angle: 0,
    centerX: 0,
    centerY: 100,
    step: 2,
    stepCenter: 50,
  });
});
test('불완전 선형과 미지원 종류 및 알 수 없는 입력 거부', () => {
  expect(
    invalidResourceDraft(
      draft({ ...raw(), kind: 'linear', linear: { ...raw().linear, step: '' } }),
    ),
  ).toBe(true);
  expect(invalidResourceDraft(draft({ ...raw(), kind: 'radial' }))).toBe(true);
  expect(invalidResourceDraft(draft({ ...raw(), extra: true } as any))).toBe(true);
});
test('초안은 입력 snapshot을 소유하고 wire에는 host marker가 없음', () => {
  const r = raw(),
    intent = complete(r);
  r.faceColor = '#ffffff';
  r.linear.angle = '90';
  expect(wire(intent).kind).toBe('solid');
  expect(wire(intent)).toEqual({ kind: 'solid', color: 0, hatchColor: 0x123456 });
  expect('resourceDraft' in wire(intent)).toBe(false);
});
test('Native의 정확 unknown 클래스는 요청후보일뿐 관측을 수정하지 않음', () => {
  const c = captured(),
    before = structuredClone(c);
  expect(available(c).enabled).toBe(true);
  expect(c).toEqual(before);
  expect(c.result.observations.aggregate['paragraph.background'].writable).toBe(false);
});
test('known writable와 mixed writable는 요청가능', () => {
  for (const state of ['known', 'mixed']) {
    const c = captured();
    c.result.observations.aggregate['paragraph.background'] = { state, writable: true };
    expect(available(c).enabled).toBe(true);
  }
});
test('다른 unknown 또는 unavailable 오류를 교체권한으로 추정하지 않음', () => {
  for (const observation of [
    {
      state: 'unknown',
      writable: false,
      reason: 'MissingBorderFillId',
      writeUnavailableReason: 'MissingSourceField',
    },
    {
      state: 'unavailable',
      writable: false,
      reason: 'UnknownBorderFillValue',
      writeUnavailableReason: 'UnknownSourceValue',
    },
    { state: 'unknown', writable: true, reason: 'UnknownBorderFillValue' },
  ]) {
    const c = captured();
    c.result.observations.aggregate['paragraph.background'] = observation;
    expect(available(c).enabled).toBe(false);
  }
});
test('읽기 미지원 또는 readonly capability는 요청도 차단', () => {
  for (const field of ['readable', 'writable']) {
    const c = captured();
    c.capabilities.fields['paragraph.background'][field] = false;
    expect(available(c).enabled).toBe(false);
  }
});
test('API 부재 및 ready 아님은 요청도 차단', () => {
  expect(available().enabled).toBe(false);
  for (const status of ['disposed', 'loading', 'refresh-required']) {
    const c = captured();
    c.state.status = status;
    expect(available(c).enabled).toBe(false);
  }
  const c = captured();
  c.capabilities = { atomic: false, reason: 'Unavailable' };
  expect(available(c).enabled).toBe(false);
});
test('복수대상·대상배열·미지원형식은 거부', () => {
  const c = captured();
  c.result.targets.push({ ref: 'two' });
  expect(available(c).enabled).toBe(false);
  const d = captured();
  d.target = [d.target];
  expect(available(d).enabled).toBe(false);
  const e = captured();
  e.target.format = 'other';
  expect(available(e).enabled).toBe(false);
});
test('세션·revision 불일치와 history 부재 거부', () => {
  for (const binding of [
    { session: 'other', revision: 0 },
    { session: 'one', revision: 1 },
    { session: 'one', revision: null },
  ]) {
    const c = captured();
    c.result.binding = binding;
    expect(available(c).enabled).toBe(false);
  }
});

import { createParagraphResourceFields } from '../src/paragraph-resource-fields.ts';
import { createParagraphShapePort } from '../src/paragraph-shape-port.ts';
import { createParagraphShapeController } from '../src/paragraph-shape-controller.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
function portFixture() {
  const c = captured(),
    calls: any[] = [];
  const api: any = {
    command: { name: 'apply-formatting-patch', id: Symbol() },
    target: () => c.target,
    capabilities: async () => c.capabilities,
    query: async () => c.result,
    dispatch: async (...args: any[]) => {
      calls.push(args);
      return { status: 'committed-with-snapshot' };
    },
  };
  return { c, calls, api, port: createParagraphShapePort(api) };
}
test('전체교체 marker는 wire에서 제거하고 기존 한명령에 명시값 전달', async () => {
  const s = portFixture();
  await s.port.apply(s.c, s.c.state, new Map([['paragraph.background', complete()]]));
  expect(s.calls).toHaveLength(1);
  expect(s.calls[0][1].patch).toEqual({
    paragraph: { background: { kind: 'solid', color: 0, hatchColor: 0x123456 } },
  });
  expect(s.c.result.observations.aggregate['paragraph.background'].writable).toBe(false);
});
test('기존 unknown 일반편집은 여전히 차단하고 stale 전체교체도 전달0', () => {
  const s = portFixture();
  expect(() =>
    s.port.apply(s.c, s.c.state, new Map([['paragraph.background', { kind: 'solid', color: 0 }]])),
  ).toThrow();
  expect(() =>
    s.port.apply(s.c, {} as any, new Map([['paragraph.background', complete()]])),
  ).toThrow('StaleParagraphShape');
  expect(s.calls).toHaveLength(0);
});
test('복수대상 또는 읽기cap없음은 전체교체도 전달0', () => {
  for (const bad of ['many', 'unreadable']) {
    const s = portFixture();
    if (bad === 'many') s.c.result.targets.push({ ref: 'two' });
    else s.c.capabilities.fields['paragraph.background'].readable = false;
    expect(() =>
      s.port.apply(s.c, s.c.state, new Map([['paragraph.background', complete()]])),
    ).toThrow();
    expect(s.calls).toHaveLength(0);
  }
});
function widgetFixture() {
  const f = documentFixture(),
    c = captured(),
    changes: any[] = [];
  const model: any = {
    captured: c,
    draft: new Map(),
    pending: false,
    loading: false,
    stale: false,
    refreshRequired: false,
    error: null,
  };
  const widget = createParagraphResourceFields(
    f.doc,
    (...args: any[]) => changes.push(args),
    () => false,
  );
  f.root.append(widget.element as any);
  widget.update(model);
  return { f, c, changes, model, widget };
}
test('unknown 편집은 꺼져 있고 명시체크 뒤에만 교체입력을 제공', () => {
  const s = widgetFixture();
  const toggle = s.f.role('background-replacement-request') as any;
  expect(s.f.role('background-kind').disabled).toBe(true);
  expect(toggle.disabled).toBe(false);
  toggle.checked = true;
  fire(toggle, 'input');
  s.widget.update(s.model);
  expect(s.f.role('background-kind').disabled).toBe(false);
  expect(invalidResourceDraft(s.changes.at(-1)[1])).toBe(true);
  s.widget.dispose();
});
test('새capture는 명시체크와 초안을 제거하고 pending은전달차단', () => {
  const s = widgetFixture();
  const toggle = s.f.role('background-replacement-request') as any;
  toggle.checked = true;
  fire(toggle, 'input');
  const before = s.changes.length;
  s.widget.update({ ...s.model, pending: true });
  fire(toggle, 'input');
  expect(s.changes).toHaveLength(before);
  s.widget.update({ ...s.model, captured: { ...s.c } });
  expect(toggle.checked).toBe(false);
  expect(s.f.role('background-kind').disabled).toBe(true);
  s.widget.dispose();
});
test('기존controller는 교체거부오류와 초안을 유지하고 취소시닫음', async () => {
  const s = portFixture();
  s.c.state.documentId = 'document';
  s.c.state.generation = 1;
  let callbacks: any,
    model: any,
    disposed = 0;
  const controller = createParagraphShapeController({
    api: {
      ...s.api,
      dispatch: async () => ({ status: 'rejected-unapplied', error: 'WriterRefused' }),
    },
    getState: () => s.c.state,
    subscribe: () => () => {},
    createView: (value: any) => {
      callbacks = value;
      return {
        update: (next: any) => {
          model = next;
        },
        isComposing: () => false,
        dispose: () => {
          disposed++;
        },
      };
    },
  });
  controller.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  callbacks.field('paragraph.background', complete());
  callbacks.apply();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(model.error).toBe('WriterRefused');
  expect(model.pending).toBe(false);
  expect(model.draft.size).toBe(1);
  expect(disposed).toBe(0);
  callbacks.cancel();
  expect(disposed).toBe(1);
  controller.dispose();
});
