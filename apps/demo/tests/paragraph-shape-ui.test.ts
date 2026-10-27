import type { SelectionTarget } from '@hwpjs/core';
import { test, expect } from 'bun:test';
import { createParagraphShapeApi } from '../src/paragraph-shape-api.ts';
import { createParagraphShapePort } from '../src/paragraph-shape-port.ts';
import { createParagraphShapeController } from '../src/paragraph-shape-controller.ts';
import { createParagraphShapeView } from '../src/paragraph-shape-view.ts';
import { documentFixture, all } from './formatting-dialog-test-dom.ts';
const settle = async () => {
  for (let n = 0; n < 8; n++) await Promise.resolve();
};
const known = (value: unknown, unit?: string) => ({
  state: 'known',
  value,
  writable: true,
  ...(unit ? { unit } : {}),
});
function fixture(
  options: {
    viewThrows?: boolean;
    disposeThrows?: boolean;
    unsubscribeThrows?: boolean;
    resultThrows?: boolean;
  } = {},
) {
  const target: SelectionTarget = {
    editorId: 'e',
    documentId: 'doc',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    coordinateSpace: 'display',
    format: 'hwp5',
    owner: 'unit-body',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    affinity: 'forward',
  };
  let state: any = {
    status: 'ready',
    stateVersion: 1,
    documentId: 'doc',
    generation: 1,
    token: {},
    selection: target,
  };
  const fields: any = {
    'paragraph.alignment': known('LEFT'),
    'paragraph.margins.left': known(0, 'HWPUNIT'),
    'paragraph.spacing.kind': known('percent'),
    'paragraph.spacing.value': known(160, 'percent'),
    'paragraph.grid': known(false),
  };
  let capCalls = 0,
    queryCalls = 0,
    closeCalls = 0,
    disposeCalls = 0,
    presentationCalls = 0,
    composing = false;
  const requests: any[] = [],
    emitted: any[] = [],
    uiErrors: any[] = [];
  let listener: (s: any) => void = () => {};
  let callbacks: any, presentation: any;
  const command = { id: Symbol(), name: 'apply-formatting-patch' };
  const api: any = {
    command,
    target: () => target,
    capabilities: async () => {
      capCalls++;
      return {
        atomic: true,
        fields: Object.fromEntries(
          Object.keys(fields).map((name) => [name, { readable: true, writable: true }]),
        ),
        selectionAdmissionFence: {
          version: 1,
          epoch: 'stateVersion',
          commands: ['APPLY_FORMATTING_PATCH'],
        },
      };
    },
    query: async () => {
      queryCalls++;
      return { schemaVersion: 1, targets: [{}], observations: { aggregate: fields } };
    },
    dispatch: async (cmd: any, payload: any) => {
      requests.push({ cmd, payload });
      return { status: 'committed-with-snapshot' };
    },
  };
  const controller = createParagraphShapeController({
    api,
    getState: () => state,
    subscribe(fn) {
      listener = fn;
      return () => {
        listener = () => {};
        if (options.unsubscribeThrows) throw Error('UnitUnsubscribeFailed');
      };
    },
    createView(c) {
      if (options.viewThrows) throw Error('UnitViewFailed');
      callbacks = c;
      return {
        update(v) {
          presentation = v;
        },
        isComposing: () => composing,
        dispose() {
          disposeCalls++;
          if (options.disposeThrows) throw Error('UnitDisposeFailed');
        },
      };
    },
    onClose() {
      closeCalls++;
    },
    onResult(r) {
      emitted.push(r);
      if (options.resultThrows) throw Error('UnitResultCallbackFailed');
    },
    onPresentationChange() {
      presentationCalls++;
    },
    onUIError(e) {
      uiErrors.push(e);
    },
  });
  return {
    api,
    controller,
    fields,
    requests,
    emitted,
    uiErrors,
    target,
    command,
    callbacks: () => callbacks,
    model: () => presentation,
    state: () => state,
    counts: () => ({ capCalls, queryCalls, closeCalls, disposeCalls, presentationCalls }),
    composing(value: boolean) {
      composing = value;
    },
    publish(next: any) {
      state = next;
      listener(next);
    },
  };
}
test('조회는 open 시 cap과 fields를 한 번씩만 요청하고 상태 listener에서는 재조회하지 않는다', async () => {
  const f = fixture();
  expect(f.controller.open()).toBe(true);
  await settle();
  expect(f.counts().capCalls).toBe(1);
  expect(f.counts().queryCalls).toBe(1);
  f.publish(f.state());
  f.publish({ ...f.state(), stateVersion: 2 });
  expect(f.counts().queryCalls).toBe(1);
  expect(f.model().stale).toBe(true);
  f.controller.dispose();
});
test('mixed·unknown의 명시 값은 dirty이며 정렬과 여백은 단일 sparse patch로 전달한다', async () => {
  const f = fixture();
  f.fields['paragraph.alignment'] = { state: 'mixed', writable: true };
  f.fields['paragraph.margins.left'] = {
    state: 'unknown',
    reason: 'Unknown',
    writable: true,
    unit: 'HWPUNIT',
  };
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'LEFT');
  f.callbacks().field('paragraph.margins.left', 0);
  f.callbacks().apply();
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(1);
  expect(f.requests[0].payload.patch).toEqual({
    paragraph: { alignment: 'LEFT', margins: { left: 0 } },
  });
  expect(f.requests[0].payload.target).toBe(f.target);
  expect(f.requests[0].payload.selectionVersion).toBe(1);
});
test('미수정·known 동일값·원래값 복귀와 취소는 command0이다', async () => {
  const f = fixture();
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'CENTER');
  f.callbacks().field('paragraph.alignment', 'LEFT');
  expect(f.model().draft.size).toBe(0);
  f.callbacks().cancel();
  expect(f.requests).toHaveLength(0);
  expect(f.counts().closeCalls).toBe(1);
});
test('쓰기 불가 관측은 임의 기본값이나 부분 성공으로 우회하지 않는다', async () => {
  const f = fixture();
  f.fields['paragraph.margins.left'] = {
    state: 'known',
    value: 0,
    writable: false,
    writeUnavailableReason: 'ReadOnlyDocument',
  };
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().field('paragraph.margins.left', 20);
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(0);
  expect(f.model().error).toBe('ReadOnlyDocument');
  f.controller.dispose();
});
test('capability 없거나 query가 실패하면 변경 명령을 만들지 않는다', async () => {
  const f = fixture();
  f.api.capabilities = async () => ({ atomic: false, reason: 'AtomicFormattingUnavailable' });
  f.controller.open();
  await settle();
  expect(f.model().captured).toBeUndefined();
  expect(f.model().error).toBe('AtomicFormattingUnavailable');
  expect(f.requests).toHaveLength(0);
  f.controller.dispose();
});
test('state identity가 바뀌면 이전 선택 초안을 제출하지 않는다', async () => {
  const f = fixture();
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.publish({ ...f.state(), stateVersion: 2 });
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(0);
  expect(f.model().error).toBe('StaleParagraphShape');
  f.controller.dispose();
});
test('문서 교체 뒤 늦은 query는 새 view나 focus를 변경하지 않는다', async () => {
  const f = fixture();
  let resolve: any;
  f.api.query = () =>
    new Promise((r) => {
      resolve = r;
    });
  f.controller.open();
  await settle();
  f.publish({ ...f.state(), documentId: 'new' });
  resolve({ schemaVersion: 1, targets: [{}], observations: { aggregate: f.fields } });
  await settle();
  expect(f.counts().disposeCalls).toBe(1);
  expect(f.counts().closeCalls).toBe(0);
  expect(f.requests).toHaveLength(0);
  f.controller.dispose();
});
test('commit-refresh와 error 원결과를 보존하고 재접수를 차단한다', async () => {
  const f = fixture(),
    result = { status: 'committed-refresh-required', error: 'SnapshotMissing' };
  f.api.dispatch = async (_c: any, payload: any) => {
    f.requests.push(payload);
    return result;
  };
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().apply();
  await settle();
  expect(f.emitted[0]).toBe(result);
  expect(f.model().refreshRequired).toBe(true);
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(1);
  f.controller.dispose();
});
test('fence가 없는 공급자에는 selectionVersion을 새로 발급하지 않는다', async () => {
  const f = fixture();
  const getcap = f.api.capabilities;
  f.api.capabilities = async () => ({ ...(await getcap()), selectionAdmissionFence: undefined });
  const port = createParagraphShapePort(f.api),
    capture = await port.read(f.state());
  await port.apply(capture, f.state(), new Map([['paragraph.alignment', 'RIGHT']]));
  expect(f.requests[0].payload.selectionVersion).toBeUndefined();
});
test('간격 값만 수정할 때 같은 관측의 known kind를 보존하며 unknown kind는 추정하지 않는다', async () => {
  const f = fixture(),
    port = createParagraphShapePort(f.api),
    capture = await port.read(f.state());
  await port.apply(capture, f.state(), new Map([['paragraph.spacing.value', 180]]));
  expect(f.requests[0].payload.patch).toEqual({
    paragraph: { spacing: { kind: 'percent', value: 180 } },
  });
  f.fields['paragraph.spacing.kind'] = { state: 'mixed', writable: true };
  expect(() => port.apply(capture, f.state(), new Map([['paragraph.spacing.value', 180]]))).toThrow(
    'ExplicitParagraphSpacingPairRequired',
  );
});
test('view는 알 수 없는 단위와 종류 전환을 성공 입력처럼 표시하지 않는다', () => {
  const { root } = documentFixture();
  const view = createParagraphShapeView(root as any, { field() {}, apply() {}, cancel() {} });
  view.update({
    captured: {
      capabilities: {
        atomic: true,
        fields: {
          'paragraph.margins.left': { readable: true, writable: true },
          'paragraph.spacing.kind': { readable: true, writable: true },
        },
      },
      result: {
        observations: {
          aggregate: {
            'paragraph.margins.left': known(200, 'hwp5-source-unit'),
            'paragraph.spacing.kind': known('percent'),
          },
        },
      },
    } as any,
    draft: new Map(),
    pending: false,
    loading: false,
    stale: false,
    refreshRequired: false,
    error: null,
  });
  const elements = all(root);
  expect(elements.find((n) => n.dataset.role === 'margins-left')?.disabled).toBe(true);
  expect(elements.find((n) => n.dataset.role === 'spacing-kind')?.disabled).toBe(true);
  view.dispose();
});
test('composition 상태에서 flag 없는 Escape와 Enter를 접수하지 않는다', () => {
  const { root } = documentFixture();
  let applied = 0,
    cancelled = 0;
  const view = createParagraphShapeView(root as any, {
    field() {},
    apply() {
      applied++;
    },
    cancel() {
      cancelled++;
    },
  });
  const dialog = all(root).find((n) => n.dataset.role === 'paragraph-shape-dialog')!;
  dialog.dispatchEvent(new Event('compositionstart'));
  for (const name of ['Escape', 'Enter']) {
    const e = new Event('keydown', { cancelable: true });
    Object.defineProperty(e, 'key', { value: name });
    dialog.dispatchEvent(e);
  }
  expect(applied).toBe(0);
  expect(cancelled).toBe(0);
  view.dispose();
});
test('token getter의 객체가 달라도 같은 state와 스칼라 값은 조회를 stale로 만들지 않는다', async () => {
  const f = fixture(),
    state = f.state();
  Object.defineProperty(state, 'token', {
    get: () =>
      Object.freeze({
        editorId: 'e',
        documentId: 'doc',
        generation: 1,
        operationRevision: 0,
        viewRevision: 0,
      }),
  });
  expect(state.token).not.toBe(state.token);
  f.controller.open();
  await settle();
  expect(f.model().captured.state).toBe(state);
  expect(f.model().stale).toBe(false);
  f.controller.dispose();
});
test('cap 전역쓰기불가와 query target쓰기가 모순되어도 UI가 승격하지 않는다', async () => {
  const f = fixture(),
    original = f.api.capabilities;
  f.api.capabilities = async () => {
    const cap = await original();
    cap.fields['paragraph.alignment'] = {
      readable: true,
      writable: false,
      writeUnavailableReason: 'ReadOnlyDocument',
    };
    return cap;
  };
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(0);
  expect(f.model().error).toBe('ReadOnlyDocument');
  f.controller.dispose();
});
test('관측은 cap에서 읽기 가능한 field만 명시하며 unknown field를 임의로 요청하지 않는다', async () => {
  const f = fixture(),
    getcap = f.api.capabilities;
  let requested: any;
  f.api.capabilities = async () => {
    const cap = await getcap();
    cap.fields['paragraph.grid'] = { readable: false, writable: false, reason: 'Unsupported' };
    return cap;
  };
  f.api.query = async (_target: any, options: any) => {
    requested = options.fields;
    return { schemaVersion: 1, targets: [{}], observations: { aggregate: f.fields } };
  };
  f.controller.open();
  await settle();
  expect(requested).not.toContain('paragraph.grid');
  expect(requested).toContain('paragraph.alignment');
  f.controller.dispose();
});
test('얇은 adapter는 같은 command와 공개 target을 전달하고 메서드 receiver를 보존한다', async () => {
  const f = fixture(),
    target = f.target,
    calls: string[] = [],
    cap = await f.api.capabilities();
  const editor: any = {
    async getFormattingCapabilities() {
      expect(this).toBe(editor);
      calls.push('cap');
      return cap;
    },
    async queryFormatting(value: any) {
      expect(this).toBe(editor);
      expect(value).toBe(target);
      calls.push('query');
      return {};
    },
    async dispatchCommand(command: any, payload: any) {
      expect(this).toBe(editor);
      expect(command).toBe(f.command);
      expect(payload.target).toBe(target);
      calls.push('dispatch');
      return {};
    },
  };
  const api = createParagraphShapeApi(editor, {
    APPLY_FORMATTING_PATCH_COMMAND: f.command,
    getSelectionFormatting: () => ({ target }),
    createParagraphSelection: (_state: any, _options: any) => target,
  } as any);
  expect(api.command).toBe(f.command);
  expect(api.target(f.state())).toBe(target);
  await api.capabilities();
  await api.query(target, { fields: [] });
  await api.dispatch(f.command as any, { target, patch: { paragraph: {} } } as any);
  expect(calls).toEqual(['cap', 'query', 'dispatch']);
});

test('cap 대기 중 선택이 바뀌면 이전 target으로 query를 보내지 않는다', async () => {
  const f = fixture();
  let resolve: (value: any) => void = () => {};
  f.api.capabilities = () =>
    new Promise((done) => {
      resolve = done;
    });
  f.controller.open();
  f.publish({ ...f.state(), stateVersion: 2 });
  resolve({ atomic: true, fields: {} });
  await settle();
  expect(f.counts().queryCalls).toBe(0);
  expect(f.requests).toHaveLength(0);
  f.controller.dispose();
});

test('field enum capability 밖의 값은 단일 patch에도 섞지 않는다', async () => {
  const f = fixture(),
    old = f.api.capabilities;
  f.api.capabilities = async () => {
    const cap = await old();
    cap.fields['paragraph.alignment'].enumValues = ['LEFT'];
    return cap;
  };
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(0);
  expect(f.model().error).toBe('UnsupportedParagraphFieldValue');
  f.controller.dispose();
});

test('닫기 중 선택이 달라졌으면 현재 선택의 focus를 빼앗지 않는다', async () => {
  const f = fixture();
  f.controller.open();
  await settle();
  f.publish({
    ...f.state(),
    stateVersion: 2,
    selection: { ...f.target, startUnit: 1, endUnit: 1 },
  });
  f.callbacks().cancel();
  expect(f.counts().closeCalls).toBe(0);
  expect(f.requests).toHaveLength(0);
  f.controller.dispose();
});

test('dispose 중 view와 unsubscribe가 throw해도 정리·중복 focus와 late dispatch를 막는다', async () => {
  const f = fixture({ disposeThrows: true, unsubscribeThrows: true });
  f.controller.open();
  await settle();
  f.controller.dispose();
  f.controller.dispose();
  expect(f.counts().disposeCalls).toBe(1);
  expect(f.counts().closeCalls).toBe(0);
  expect(f.uiErrors).toHaveLength(2);
  expect(f.controller.presentation().open).toBe(false);
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(0);
});
test('pending apply 뒤 dispose하면 늦은 성공을 새 view에 게시하거나 재적용하지 않는다', async () => {
  const f = fixture();
  let finish: (value: any) => void = () => {};
  f.api.dispatch = (_command: any, payload: any) => {
    f.requests.push(payload);
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().apply();
  f.callbacks().apply();
  expect(f.requests).toHaveLength(1);
  f.controller.dispose();
  finish({ status: 'committed-with-snapshot' });
  await settle();
  expect(f.requests).toHaveLength(1);
  expect(f.emitted).toHaveLength(0);
  expect(f.counts().closeCalls).toBe(0);
});
test('result callback 오류는 실제 성공 분류를 바꾸거나 재접수시키지 않는다', async () => {
  const f = fixture({ resultThrows: true });
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().apply();
  await settle();
  expect(f.emitted[0].status).toBe('committed-with-snapshot');
  expect(f.requests).toHaveLength(1);
  expect(f.uiErrors).toHaveLength(1);
  expect(f.controller.presentation().open).toBe(false);
  f.controller.dispose();
});
test('view 생성 오류는 조회 전에 닫히며 다음 context를 남기지 않는다', () => {
  const f = fixture({ viewThrows: true });
  expect(f.controller.open()).toBe(false);
  expect(f.controller.presentation().open).toBe(false);
  expect(f.counts().capCalls).toBe(0);
  expect(f.counts().queryCalls).toBe(0);
  expect(f.requests).toHaveLength(0);
  f.controller.dispose();
});
test('모달 조합 중 apply/cancel은 처리하지 않고 조합 종료 뒤 단일 적용한다', async () => {
  const f = fixture();
  f.controller.open();
  await settle();
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.composing(true);
  f.callbacks().apply();
  f.callbacks().cancel();
  await settle();
  expect(f.requests).toHaveLength(0);
  expect(f.counts().closeCalls).toBe(0);
  f.composing(false);
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(1);
  f.controller.dispose();
});
test('readonly는 cap/query로 보여주되 직접 field callback으로도 mutation하지 않는다', async () => {
  const f = fixture(),
    previous = f.api.capabilities;
  f.api.capabilities = async () => {
    const cap = await previous();
    for (const field of Object.values(cap.fields) as any[]) {
      field.writable = false;
      field.writeUnavailableReason = 'ReadOnlyDocument';
    }
    return cap;
  };
  for (const field of Object.values(f.fields) as any[]) {
    field.writable = false;
    field.writeUnavailableReason = 'ReadOnlyDocument';
  }
  f.controller.open();
  await settle();
  expect(f.counts().queryCalls).toBe(1);
  f.callbacks().field('paragraph.alignment', 'RIGHT');
  f.callbacks().apply();
  await settle();
  expect(f.requests).toHaveLength(0);
  expect(f.model().error).toBe('ReadOnlyDocument');
  f.callbacks().cancel();
  f.controller.dispose();
});
test('조회 완료 시 presentation이 다시 갱신되어 loading 도구를 남기지 않는다', async () => {
  const f = fixture();
  f.controller.open();
  const initial = f.counts().presentationCalls;
  await settle();
  expect(f.model().loading).toBe(false);
  expect(f.counts().presentationCalls).toBeGreaterThan(initial);
  f.controller.dispose();
});
