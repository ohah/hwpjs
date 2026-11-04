import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommandSupport } from '../src/command-support.ts';
const ready = {
  document: 'ready',
  hasSelection: false,
  connected: true,
  availability: { enabled: true, surfaceSelection: true },
};
test('Surface 실제 선택 표시 근거는 copy/cut/underline/strike에만 적용', () => {
  for (const command of ['copy', 'cut', 'underline', 'strike'])
    assert.equal(resolveCommandSupport(command, ready).enabled, true);
  for (const command of ['bold', 'italic', 'character-properties', 'text-color'])
    assert.equal(resolveCommandSupport(command, ready).kind, 'missing-selection');
});
test('표시 태그 없는 enabled만으로 public 선택 부재를 우회하지 않음', () => {
  for (const availability of [{ enabled: true }, { enabled: true, surfaceSelection: false }])
    assert.equal(resolveCommandSupport('underline', { ...ready, availability }).enabled, false);
});
test('disabled/readonly/unknown/pending 포트는 표시 태그가 있어도 활성화하지 않음', () => {
  for (const reason of [
    'ReadOnly',
    'UnknownCharacterFormatting',
    'FormattingPending',
    'StaleSurface',
  ])
    assert.equal(
      resolveCommandSupport('strike', {
        ...ready,
        availability: { enabled: false, surfaceSelection: true, reason },
      }).enabled,
      false,
    );
});
test('Surface 표시 선택은 문서/대기/종료 deny보다 우선하지 않음', () => {
  for (const override of [
    { document: 'loading' },
    { document: 'none' },
    { document: 'error' },
    { busy: true },
    { disposed: true },
    { connected: false },
  ])
    assert.equal(resolveCommandSupport('copy', { ...ready, ...override }).enabled, false);
});
test('최신 포트 unavailable은 이전 Surface 표시 enabled를 승계하지 않음', () => {
  assert.equal(resolveCommandSupport('underline', ready).enabled, true);
  const latest = {
    ...ready,
    availability: { enabled: false, surfaceSelection: true, reason: 'StaleSurface' },
  };
  assert.equal(resolveCommandSupport('underline', latest).enabled, false);
  assert.equal(
    resolveCommandSupport('underline', { ...ready, availability: undefined }).enabled,
    false,
  );
});
