import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
  SPLICE_TEXT_COMMAND,
} from '../../src/index.ts';
import {
  bindRuntimeAdmission,
  RuntimeAdmissionRejected,
} from '../../src/internal/runtime-admission.ts';
import { validateParagraphFormattingPatch } from '../../src/commands/atomic-formatting.ts';
import type {
  EditorRuntime,
  RuntimeMessage,
  RuntimeReply,
  RuntimeRequestContext,
} from '../../src/contracts.ts';
const known = (value: unknown, unit?: string) => ({
  state: 'known',
  value,
  writable: true,
  ...(unit ? { unit } : {}),
});
const unknown = () => ({
  state: 'unknown',
  reason: 'MissingSourceField',
  writable: false,
  writeUnavailableReason: 'MissingSourceField',
});
const fields = {
  'paragraph.alignment': known('LEFT'),
  'paragraph.margins.left': known(17, 'HWPUNIT'),
  'paragraph.grid': unknown(),
};
function backend(
  options: {
    trusted?: boolean;
    nativeCode?: number;
    postError?: string;
    delay?: () => Promise<void>;
    delayKind?: RuntimeMessage['kind'];
  } = {},
) {
  const calls: RuntimeMessage[] = [];
  const issuedBindings: { session: string; revision: number }[] = [];
  let revision = 0,
    bindingRevision = 0,
    closed = false;
  const content = () => ({
    format: 'hwpx',
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB😀CD',
        editable: true,
        selectionOwner: 'section:0:body',
      },
    ],
  });
  const runtime: EditorRuntime = {
    async request(message, context) {
      calls.push(message);
      const base = {
        kind: message.kind,
        historyRevision: revision,
        meta: { context, application: 'unapplied' as const, changed: false },
      };
      if (message.kind === 'formatting-capabilities')
        return {
          ...base,
          formattingCapabilities: {
            schemaVersion: 1,
            atomic: true,
            format: 'hwpx',
            coordinateSpace: 'native-source-utf16',
            requiresHistoryProtocol: 2,
            binding: { session: 'native-unit-session', revision: bindingRevision },
            fields: Object.fromEntries(
              Object.keys(fields).map((k) => [k, { readable: true, writable: true }]),
            ),
            limits: {
              requestBytes: 65536,
              replyBytes: 2097152,
              targets: 4096,
              ranges: 4096,
              commands: 4096,
              fontNameBytes: 4096,
              projectionBytes: 33554432,
            },
          },
        };
      if (message.kind === 'query-formatting') {
        issuedBindings.push({ session: 'native-unit-session', revision: bindingRevision });
        const wanted = message.fields as readonly string[] | undefined;
        const rows = Object.fromEntries(
          Object.entries(fields).filter(([key]) => wanted === undefined || wanted.includes(key)),
        );
        return {
          ...base,
          formatting: {
            schemaVersion: 1,
            binding: { session: 'native-unit-session', revision: bindingRevision },
            targets: [{ ref: 'native-opaque-original-owner' }],
            observations: {
              perTarget: [{ ref: 'native-opaque-original-owner', fields: rows }],
              aggregate: rows,
            },
          },
        };
      }
      if (message.kind === 'formatting-patch') {
        const request = message.request as { binding: { revision: number } };
        if (request.binding.revision !== bindingRevision)
          return { ...base, formattingNativeCode: 0, error: 'StaleFormattingBinding' } as RuntimeReply;

        const code = options.nativeCode ?? 1;
        if (code === 1) { revision++; bindingRevision++; }
        return {
          ...base,
          formattingNativeCode: code,
          historyRevision: revision,
          ...(code === 3 ? { historyPoisoned: true } : {}),
          ...(options.postError
            ? { error: options.postError }
            : code === 0
              ? { error: 'NativeRefused' }
              : {}),
          ...(code === 1 && !options.postError ? { content: content() } : {}),
          meta: {
            context,
            application: code === 1 ? 'applied' : code === 3 ? 'unknown' : 'unapplied',
            changed: code === 3 ? null : code === 1,
          },
        } as RuntimeReply;
      }
      if (message.kind === 'splice') {
        revision++; bindingRevision++;
        return {
          ...base,
          historyRevision: revision,
          content: content(),
          meta: { context, application: 'applied', changed: true },
        } as RuntimeReply;
      }
      return { ...base, content: content() };
    },
    dispose() {
      closed = true;
    },
  };
  if (options.trusted)
    bindRuntimeAdmission(
      runtime,
      async (m, c, a) => {
        if (options.delayKind === undefined || m.kind === options.delayKind) await options.delay?.();
        a();
        return runtime.request(m, c);
      },
      () => !closed,
    );
  const editor = createEditor({ runtimeFactory: () => runtime });
  return { runtime, editor, calls, issuedBindings, advanceNativeBinding: () => { bindingRevision++; } };
}
async function loaded(options: Parameters<typeof backend>[0] = {}, editable = true) {
  const h = backend(options);
  await h.editor.load(new Uint8Array([1]), { format: 'hwpx', editable });
  return h;
}
const target = (h: Awaited<ReturnType<typeof loaded>>, startUnit = 0, endUnit = startUnit) =>
  createParagraphSelection(h.editor.getEditorState(), {
    section: 0,
    paragraph: 0,
    startUnit,
    endUnit,
  });
const patch = {
  paragraph: {
    alignment: 'RIGHT' as const,
    margins: { left: 31 },
    spacing: { kind: 'percent' as const, value: 120 },
  },
};

test('custom runtime의 Native-looking cap DTO는 atomic 권위를 얻지 못한다', async () => {
  const h = await loaded();
  try {
    const cap = await h.editor.getFormattingCapabilities();
    assert.deepEqual(Object.fromEntries(Object.entries(cap)), {
      atomic: false,
      reason: 'UnsupportedAtomicRuntime',
    });
    await assert.rejects(h.editor.queryFormatting(target(h)), /UnsupportedAtomicRuntime/);
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h),
      patch,
    });
    assert.equal(r.status, 'rejected-unapplied');
    assert.equal(r.error, 'UnsupportedAtomicRuntime');
    assert.equal(
      h.calls.some((x) => x.kind === 'formatting-capabilities' || x.kind === 'formatting-patch'),
      false,
    );
  } finally {
    await h.editor.dispose();
  }
});

test('명시 cap/query는 state identity·token·selection을 게시하지 않고 원 단위를 보존한다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const before = h.editor.getEditorState(),
      t = target(h);
    assert.equal(
      h.calls.some((x) => String(x.kind).includes('formatting')),
      false,
    );
    const cap = await h.editor.getFormattingCapabilities();
    assert.equal(cap.atomic, true);
    assert.equal(h.editor.getEditorState(), before);
    const value = await h.editor.queryFormatting(t, {
      fields: ['paragraph.alignment', 'paragraph.margins.left', 'paragraph.grid'],
    });
    assert.equal(h.editor.getEditorState(), before);
    assert.deepEqual(h.editor.getEditorState().token, before.token);
    assert.equal(h.editor.getEditorState().stateVersion, before.stateVersion);
    assert.equal(value.observations.aggregate['paragraph.margins.left'].unit, 'HWPUNIT');
    assert.equal(value.observations.aggregate['paragraph.grid'].state, 'unknown');
    assert.equal(Object.hasOwn(value.observations.aggregate['paragraph.grid'], 'value'), false);
    assert(Object.isFrozen(value));
    assert(cap.atomic && cap.selectionAdmissionFence?.epoch === 'stateVersion');
  } finally {
    await h.editor.dispose();
  }
});

test('readonly query는 Native 관측을 유지하고 host writable만 제한한다', async () => {
  const h = await loaded({ trusted: true }, false);
  try {
    const t = target(h);
    const q = await h.editor.queryFormatting(t);
    assert.equal(q.observations.aggregate['paragraph.alignment'].writable, false);
    assert.equal(
      q.observations.aggregate['paragraph.alignment'].writeUnavailableReason,
      'ReadOnlyDocument',
    );
    assert.equal(
      q.observations.aggregate['paragraph.grid'].writeUnavailableReason,
      'MissingSourceField',
    );
    const before = h.calls.length;
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, { target: t, patch });
    assert.equal(r.error, 'ReadOnlyDocument');
    assert.equal(h.calls.length, before);
  } finally {
    await h.editor.dispose();
  }
});

for (const code of [0, 1, 2, 3] as const)
  test('Native completion ' + code + '는 setter 분해 없이 분류한다', async () => {
    const h = await loaded({ trusted: true, nativeCode: code });
    try {
      const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
        target: target(h),
        patch,
      });
      assert.equal(
        r.status,
        code === 0
          ? 'rejected-unapplied'
          : code === 1
            ? 'committed-with-snapshot'
            : code === 2
              ? 'known-no-op'
              : 'committed-refresh-required',
      );
      assert.equal(r.changed, code === 3 ? null : code === 1);
      assert.equal(h.calls.filter((x) => x.kind === 'formatting-patch').length, 1);
      assert.equal(
        h.calls.some((x) =>
          ['paragraph-alignment', 'paragraph-spacing', 'paragraph-margins'].includes(x.kind),
        ),
        false,
      );
      const request = h.calls.find((x) => x.kind === 'formatting-patch')!.request as any;
      assert.equal(request.targets[0].ref, 'native-opaque-original-owner');
      assert.deepEqual(Object.fromEntries(Object.entries(request.patch.paragraph.margins)), {
        left: 31,
      });
    } finally {
      await h.editor.dispose();
    }
  });

for (const code of [1, 2] as const)
  test('Native ' + code + ' 이후 관측 실패에도 완료사실 유지', async () => {
    const h = await loaded({ trusted: true, nativeCode: code, postError: 'ProjectionFailed' });
    try {
      const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
        target: target(h),
        patch,
      });
      assert.equal(r.status, code === 1 ? 'committed-refresh-required' : 'known-no-op');
      assert.equal(r.changed, code === 1);
      assert.equal(r.error, 'ProjectionFailed');
      assert.equal(h.calls.filter((x) => x.kind === 'formatting-patch').length, 1);
    } finally {
      await h.editor.dispose();
    }
  });

for (const bad of [
  { character: { bold: true } },
  { reset: { scope: 'paragraph' } },
  { paragraph: { margins: { left: null } } },
  { paragraph: { margins: { left: 2, unit: 'pt' } } },
  { paragraph: { spacing: { kind: 'fixed', value: 1.5 } } },
  { paragraph: { grid: 0 } },
])
  test('잘못된 단위/범위/미공개 intent 거부 ' + JSON.stringify(bad), () =>
    assert.throws(() => validateParagraphFormattingPatch(bad)),
  );

test('strict selection fence는 composition settle 이후 기존 stateVersion으로 판단한다', async () => {
  const h = await loaded({ trusted: true });
  let lease: ReturnType<typeof h.editor.acquireInputSurface>;
  let clear = false;
  try {
    lease = h.editor.acquireInputSurface({
      async commitComposition() {
        if (clear) {
          clear = false;
          await lease.publishSelection(null);
        }
        return 'unchanged';
      },
      cancelComposition() {},
    });
    const t = target(h),
      version = h.editor.getEditorState().stateVersion;
    clear = true;
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: t,
      selectionVersion: version,
      patch,
    });
    assert.equal(r.error, 'StaleFormattingSelection');
    assert.equal(h.calls.filter((x) => x.kind === 'formatting-patch').length, 0);
    lease.release();
  } finally {
    await h.editor.dispose();
  }
});

test('Builtin port라도 request 교체·복원 후 권위는 되살아나지 않는다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const old = h.runtime.request;
    h.runtime.request = async () => ({ kind: 'fake' });
    assert.equal((await h.editor.getFormattingCapabilities()).atomic, false);
    h.runtime.request = old;
    assert.equal((await h.editor.getFormattingCapabilities()).atomic, false);
  } finally {
    await h.editor.dispose();
  }
});

test('dispatch 이전 비동기 admission 실패는 알려진 미적용이다', async () => {
  let release!: () => void,
    version = 0,
    calls = 0;
  const wait = new Promise<void>((r) => (release = r));
  const runtime: EditorRuntime = {
    async request(m) {
      calls++;
      return { kind: m.kind };
    },
    dispose() {},
  };
  bindRuntimeAdmission(
    runtime,
    async (m, c, a) => {
      await wait;
      a();
      return runtime.request(m, c);
    },
    () => true,
  );
  const { requestAtRuntimeAdmission } = await import('../../src/internal/runtime-admission.ts');
  const pending = requestAtRuntimeAdmission(
    runtime,
    { kind: 'formatting-patch' },
    { editorId: 'unit', documentId: 'unit', generation: 1, requestId: 1, operationRevision: 1 },
    () => {
      if (version) throw Error('StaleFormattingSelection');
    },
  );
  version++;
  release();
  await assert.rejects(
    pending,
    (e) => e instanceof RuntimeAdmissionRejected && e.message === 'StaleFormattingSelection',
  );
  assert.equal(calls, 0);
});
test('잘못된 owner의 atomic patch는 Native 준비 조회도 시작하지 않는다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const before = h.calls.length;
    const r = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: { ...target(h), owner: 'forged' },
      patch,
    });
    assert.equal(r.error, 'InvalidSelectionOwner');
    assert.equal(h.calls.length, before);
  } finally {
    await h.editor.dispose();
  }
});
test('오래된 operation target은 다음 query에 재사용되지 않는다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const t = target(h);
    await h.editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target: t, text: 'X' });
    const before = h.calls.length;
    await assert.rejects(h.editor.queryFormatting(t), /StaleTarget/);
    assert.equal(h.calls.length, before);
  } finally {
    await h.editor.dispose();
  }
});
console.log(
  JSON.stringify({
    scope: '내부 admission 포트를 명시 등록한 합성 core 단위. 실제 Native 실행 증거와 별도',
    defaultFormattingReadsExpected: 0,
  }),
);

test('token getter는 조회 전부터 값이 같은 독립 wrapper다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const s = h.editor.getEditorState();
    assert.notEqual(s.token, s.token);
    assert.deepEqual(s.token, s.token);
    await h.editor.getFormattingCapabilities();
    assert.equal(h.editor.getEditorState(), s);
    assert.deepEqual(h.editor.getEditorState().token, s.token);
  } finally {
    await h.editor.dispose();
  }
});
test('명시 null capability token은 현재 token으로 대체하지 않는다', async () => {
  const h = await loaded({ trusted: true });
  try {
    const before = h.calls.length;
    assert.throws(
      () => h.editor.getFormattingCapabilities({ token: null as any }),
      /InvalidFormattingCapabilityOptions/,
    );
    assert.equal(h.calls.length, before);
  } finally {
    await h.editor.dispose();
  }
});
test('getter로 request를 바꾸어도 getter 실행 없이 지원을 철회한다', async () => {
  const h = await loaded({ trusted: true });
  let visits = 0;
  try {
    Object.defineProperty(h.runtime, 'request', {
      get() {
        visits++;
        throw Error('GetterExecuted');
      },
      configurable: true,
    });
    assert.equal((await h.editor.getFormattingCapabilities()).atomic, false);
    assert.equal(visits, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('dispatch 입력은 async 준비 전에 깊게 소유한다', async () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  const h = await loaded({ trusted: true, delay: () => wait });
  try {
    const mutable = { paragraph: { margins: { left: 37 } } };
    const result = h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: target(h),
      patch: mutable,
    });
    mutable.paragraph.margins.left = 999;
    release();
    assert.equal((await result).status, 'committed-with-snapshot');
    assert.equal(
      (h.calls.find((x) => x.kind === 'formatting-patch')!.request as any).patch.paragraph.margins
        .left,
      37,
    );
  } finally {
    release();
    await h.editor.dispose();
  }
});


test('fields 누락과 빈 배열을 구분하며 on-demand 관측 identity를 유지한다', async () => {
  const h = await loaded({trusted:true});
  try { const state=h.editor.getEditorState(), t=target(h), beforeToken=state.token;
    const all=await h.editor.queryFormatting(t), empty=await h.editor.queryFormatting(t,{fields:[]});
    assert.equal(Object.keys(all.observations.aggregate).length,3);
    assert.deepEqual(Object.keys(empty.observations.aggregate),[]);
    assert.deepEqual(Object.keys(empty.observations.perTarget[0].fields),[]);
    assert.equal(empty.targets.length,1);
    const calls=h.calls.filter(x=>x.kind==='query-formatting');
    assert.equal(calls[0].fields,undefined);assert.deepEqual(calls[1].fields,[]);
    assert.equal(h.editor.getEditorState(),state);assert.deepEqual(state.token,beforeToken);
  } finally { await h.editor.dispose(); }
});

test('query 뒤 admission 대기 중 dispose는 Native patch 전 거부한다', async () => {
  let release!:()=>void, entered!:()=>void;
  const gate=new Promise<void>(r=>release=r), waiting=new Promise<void>(r=>entered=r);
  const h=await loaded({trusted:true,delayKind:'formatting-patch',delay:async()=>{entered();await gate}});
  try { const pending=h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND,{target:target(h),patch});
    await waiting;assert.deepEqual(h.issuedBindings,[{session:'native-unit-session',revision:0}]);assert.equal(h.calls.some(x=>x.kind==='formatting-patch'),false);const disposed=h.editor.dispose();release();const answer=await pending;
    assert.equal(answer.status,'rejected-unapplied');assert.equal(answer.error,'EditorDisposed');
    assert.equal(h.calls.filter(x=>x.kind==='formatting-patch').length,0);await disposed;
  }finally{release();await h.editor.dispose()}
});

test('합성 Native binding 변경은 재발급 없이 code0 원오류로 거부한다', async () => {
  let release!:()=>void, entered!:()=>void;
  const gate=new Promise<void>(r=>release=r),waiting=new Promise<void>(r=>entered=r);
  const h=await loaded({trusted:true,delayKind:'formatting-patch',delay:async()=>{entered();await gate}});
  try { const pending=h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND,{target:target(h),patch});
    await waiting;assert.deepEqual(h.issuedBindings,[{session:'native-unit-session',revision:0}]);assert.equal(h.calls.some(x=>x.kind==='formatting-patch'),false);h.advanceNativeBinding();release();const answer=await pending;
    assert.equal(answer.status,'rejected-unapplied');assert.equal(answer.error,'StaleFormattingBinding');
    assert.equal(answer.reply?.formattingNativeCode,0);assert.equal(h.calls.filter(x=>x.kind==='formatting-patch').length,1);
    assert.equal(h.editor.getEditorState().nativeHistoryRevision,0);
  }finally{release();await h.editor.dispose()}
});

test('Native1 뒤 projection 실패는 재시도 없이 refresh-required 완료사실을 유지한다', async () => {
  const h=await loaded({trusted:true,nativeCode:1,postError:'InjectedProjectionFailure'});
  try { const answer=await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND,{target:target(h),patch});
    assert.equal(answer.status,'committed-refresh-required');assert.equal(answer.reply?.formattingNativeCode,1);
    assert.equal(answer.state.status,'refresh-required');assert.equal(h.calls.filter(x=>x.kind==='formatting-patch').length,1);
    assert.equal(h.calls.some(x=>x.kind==='splice'),false);
    await h.editor.refresh();assert.equal(h.editor.getEditorState().nativeHistoryRevision,1);
    assert.equal(h.calls.filter(x=>x.kind==='formatting-patch').length,1);
  }finally{await h.editor.dispose()}
});
