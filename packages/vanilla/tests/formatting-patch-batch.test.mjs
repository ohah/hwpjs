import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAtomicRangeRequest } from '../../../web/preview/range-atomic-formatting.mjs';
import { queryAtomicFormatting } from '../../../web/preview/atomic-formatting-command.mjs';
const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
function fixture() {
  const cap = {
    schemaVersion: 1,
    atomic: true,
    format: 'hwpx',
    coordinateSpace: 'native-source-utf16',
    requiresHistoryProtocol: 2,
    binding: { session: 's1', revision: 0 },
    fields: Object.fromEntries(
      ['paragraph.alignment', ...languages.map((l) => 'character.fonts.' + l + '.name')].map(
        (k) => [k, { writable: true }],
      ),
    ),
    limits: {
      requestBytes: 65536,
      replyBytes: 2097152,
      targets: 4096,
      ranges: 4096,
      commands: 4096,
      fontNameBytes: 4096,
    },
  };
  const selectors = [0, 1].map((paragraph) => ({
    kind: 'original-paragraph',
    section: 0,
    paragraph,
  }));
  const calls = [];
  let valid = true;
  const f = {
    cap,
    selectors,
    calls,
    marker: true,
    hook: null,
    capCalls: 0,
    invalidate() {
      valid = false;
    },
    async read(message, token) {
      calls.push({ message, token });
      if (f.hook) f.hook(message);
      if (message.kind === 'formatting-capabilities') {
        f.capCalls++;
        return { formattingCapabilities: cap, formattingBatchQueryAvailable: f.marker };
      }
      return {
        formatting: {
          schemaVersion: 1,
          binding: { ...cap.binding },
          targets: message.selectors.map((s, i) => ({
            ref: 'Native-' + i,
            ...(s.ranges ? { ranges: s.ranges } : {}),
          })),
        },
      };
    },
  };
  f.options = {
    read: (...args) => f.read(...args),
    selectors,
    intent: { kind: 'alignment', alignment: 'CENTER' },
    token: { editorId: 'e', documentId: 'd', generation: 1, operationRevision: 0, viewRevision: 0 },
    revision: 0,
    format: 'hwpx',
    current: () => valid,
  };
  return f;
}
test('여러 대상은 한 batch 조회와 Native 반환 참조로 단일 patch를 준비한다', async () => {
  const f = fixture();
  const r = await prepareAtomicRangeRequest(f.options);
  assert.deepEqual(
    f.calls.map((c) => c.message.kind),
    ['formatting-capabilities', 'query-formatting', 'formatting-capabilities'],
  );
  assert.deepEqual(r.targets, [{ ref: 'Native-0' }, { ref: 'Native-1' }]);
  assert.deepEqual(r.patch, { paragraph: { alignment: 'CENTER' } });
  assert.equal(Object.isFrozen(r), true);
});
test('대표 글꼴은 정확히 일곱 name의 한 patch이고 ranges를 보존한다', async () => {
  const f = fixture();
  f.options.intent = {
    kind: 'font-names',
    names: Object.fromEntries(languages.map((l) => [l, '검증 글꼴'])),
  };
  for (const s of f.selectors) s.ranges = [{ startUnit: 0, endUnit: 2 }];
  const r = await prepareAtomicRangeRequest(f.options);
  assert.equal(Object.keys(r.patch.character.fonts).length, 7);
  assert.deepEqual(r.targets[0].ranges, [{ startUnit: 0, endUnit: 2 }]);
});
test('구 transport는 R회 조회로 우회하지 않는다', async () => {
  const f = fixture();
  f.marker = false;
  await assert.rejects(prepareAtomicRangeRequest(f.options), /AtomicBatchQueryUnavailable/);
  assert.equal(f.calls.length, 1);
});
test('조회 중 입력이나 선택 변경이면 후속 요청을 준비하지 않는다', async () => {
  const f = fixture();
  f.hook = (m) => {
    if (m.kind === 'query-formatting') f.invalidate();
  };
  await assert.rejects(prepareAtomicRangeRequest(f.options), /StaleFormattingSelection/);
  assert.equal(f.calls.length, 2);
});
test('최종 capability 철회와 축소된 한도를 다시 확인한다', async () => {
  for (const mutate of [
    (f) => {
      f.cap.fields['paragraph.alignment'].writable = false;
    },
    (f) => {
      f.cap.limits.targets = 1;
    },
  ]) {
    const f = fixture();
    f.hook = (m) => {
      if (m.kind === 'formatting-capabilities' && f.capCalls === 1) mutate(f);
    };
    await assert.rejects(
      prepareAtomicRangeRequest(f.options),
      /AtomicFormattingFieldUnavailable|FormattingRequestLimit/,
    );
  }
});
test('호출자가 query 중 원래 배열과 token을 바꿔도 소유 입력은 유지한다', async () => {
  const f = fixture();
  f.hook = (m) => {
    if (m.kind === 'query-formatting') {
      f.selectors[0].paragraph = 99;
      f.options.token.documentId = '다른문서';
    }
  };
  const r = await prepareAtomicRangeRequest(f.options);
  assert.equal(r.targets[0].ref, 'Native-0');
  assert.equal(f.calls[1].message.selectors[0].paragraph, 0);
  assert.equal(f.calls[2].token.documentId, 'd');
});
test('HX batch는 한 Native 호출에서 각 원본문단 좌표만 한 번 변환한다', () => {
  const calls = [];
  const editor = {
    supportsAtomicFormatting: () => true,
    atomicFormattingCapabilities: () => ({
      atomic: true,
      binding: { session: 's1', revision: 0 },
      limits: { targets: 4096 },
    }),
    queryFormatting: (q) => {
      calls.push(q);
      return q;
    },
  };
  queryAtomicFormatting(editor, 'hwpx', {
    selectors: [0, 4].map((paragraph) => ({ kind: 'original-paragraph', section: 0, paragraph })),
    fields: [],
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].selectors.map((s) => s.paragraph),
    [1, 5],
  );
  assert.throws(
    () => queryAtomicFormatting(editor, 'hwpx', { selectors: [], fields: [] }),
    /InvalidFormattingSelectors/,
  );
  assert.equal(calls.length, 1);
});
