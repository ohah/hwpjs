import test from 'node:test';
import assert from 'node:assert/strict';
import { attachHwp5CurrentReferences as attach } from '../../../../web/preview/hwp5-current-reference-content.mjs';
const ref = (epoch = '2') => ({
  epoch,
  kind: 'original',
  section: 0,
  id: '87',
  row: 0,
  column: 0,
  scope: 'owned-test-session',
});
const content = () => ({ paragraphs: [{ section: 0, paragraph: 0 }] });
const preview = { sections: [{ paragraphs: [{}] }] };
const issuer = (change = {}) => ({
  supportsCurrentReferences: () => true,
  supportsCurrentSourceReferences: () => true,
  paragraphCount: () => 1,
  currentSourceReferences: () => ({ total: 1, first: 0, references: [ref()] }),
  ...change,
});
test('canonical read issuer works with no history enable method', () => {
  const c = content();
  attach(issuer(), preview, c);
  assert.deepEqual(c.paragraphs[0].currentReference, ref());
  assert.deepEqual(c.currentReferenceErrors, []);
});
test('count mismatch retains error and drops prior authority', () => {
  const c = content();
  c.paragraphs[0].currentReference = ref('1');
  attach(issuer({ paragraphCount: () => 2 }), preview, c);
  assert.equal(c.paragraphs[0].currentReference, undefined);
  assert.deepEqual(c.currentReferenceErrors, [
    { section: 0, error: 'CurrentReferenceDisplayMismatch' },
  ]);
});
test('wrong section is rejected by canonical window validation', () => {
  const c = content();
  attach(
    issuer({
      currentSourceReferences: () => ({
        total: 1,
        first: 0,
        references: [{ ...ref(), section: 1 }],
      }),
    }),
    preview,
    c,
  );
  assert.equal(c.paragraphs[0].currentReference, undefined);
  assert.equal(c.currentReferenceErrors[0].error, 'CurrentReferenceDisplayMismatch');
});
test('Native issuer errors are retained without fabricated references', () => {
  const c = content();
  attach(
    issuer({
      currentSourceReferences: () => {
        throw Error('NativeReadDenied');
      },
    }),
    preview,
    c,
  );
  assert.equal(c.paragraphs[0].currentReference, undefined);
  assert.equal(c.currentReferenceErrors[0].error, 'NativeReadDenied');
});
test('new projection obtains new epoch and scope from issuer', () => {
  const a = content(),
    b = content();
  attach(issuer(), preview, a);
  const next = { ...ref('3'), scope: 'next-native-session' };
  attach(
    issuer({ currentSourceReferences: () => ({ total: 1, first: 0, references: [next] }) }),
    preview,
    b,
  );
  assert.deepEqual(b.paragraphs[0].currentReference, next);
  assert.notEqual(a.paragraphs[0].currentReference, b.paragraphs[0].currentReference);
});
test('unsupported reference ABI removes stale authority', () => {
  const c = content();
  c.paragraphs[0].currentReference = ref();
  attach(issuer({ supportsCurrentReferences: () => false }), preview, c);
  assert.equal(c.paragraphs[0].currentReference, undefined);
});
