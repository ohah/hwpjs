import test from 'node:test';
import assert from 'node:assert/strict';
import { atomicRangeUnavailable } from '../../../web/preview/range-atomic-formatting.mjs';
const capability = (reason) => ({
  schemaVersion: 1,
  atomic: true,
  format: 'hwpx',
  coordinateSpace: 'native-source-utf16',
  requiresHistoryProtocol: 2,
  fields: { 'paragraph.alignment': { writable: false, writeUnavailableReason: reason } },
});
test('비정상 거부 사유도 문자열 거부를 유지한다', () => {
  for (const reason of [123, true, {}, [], null, undefined, ''])
    assert.equal(
      atomicRangeUnavailable(capability(reason), 'alignment', 'hwpx'),
      'AtomicFormattingFieldUnavailable',
    );
});
test('정상 거부 사유와 명시 허용은 기존과 같다', () => {
  assert.equal(
    atomicRangeUnavailable(capability('ReadOnlyDocument'), 'alignment', 'hwpx'),
    'ReadOnlyDocument',
  );
  const cap = capability('무시할 이전 사유');
  cap.fields['paragraph.alignment'].writable = true;
  assert.equal(atomicRangeUnavailable(cap, 'alignment', 'hwpx'), null);
  assert.equal(atomicRangeUnavailable(null, 'alignment', 'hwpx'), 'AtomicFormattingUnavailable');
});
