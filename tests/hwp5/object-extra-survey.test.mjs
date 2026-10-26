import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  commonObjectExtra,
  surveyDocument,
  cfbSurveyPaths,
} from '../../tools/hwp5-object-extra-survey.mjs';

test('object survey selects actual CFB signatures regardless of HWP HWPX suffix', () => {
  const signatures = {
    'renamed.hwpx': Buffer.from('d0cf11e0a1b11ae1', 'hex'),
    'zip.hwp': Buffer.from('504b030400000000', 'hex'),
    'short.hwp': Buffer.from([0xd0]),
  };
  assert.deepEqual(
    cfbSurveyPaths(Object.keys(signatures), (path) => signatures[path]),
    ['renamed.hwpx'],
  );
});

test('object extra observer separates absent empty description and arbitrary opaque suffix', () => {
  for (const length of [39, 40, 41, 42, 43])
    assert.throws(() => commonObjectExtra(Buffer.alloc(length)), /TruncatedCommonObject/);
  assert.deepEqual(commonObjectExtra(Buffer.alloc(44)), {
    descriptionUnits: null,
    extraBytes: 0,
    extraHex: '',
  });
  assert.deepEqual(commonObjectExtra(Buffer.alloc(46)), {
    descriptionUnits: 0,
    extraBytes: 0,
    extraHex: '',
  });
  const raw = Buffer.alloc(52);
  raw.writeUInt16LE(1, 44);
  raw.writeUInt16LE(0xac00, 46);
  raw.set([0, 255, 128, 1], 48);
  assert.deepEqual(commonObjectExtra(raw), {
    descriptionUnits: 1,
    extraBytes: 4,
    extraHex: '00ff8001',
  });
  assert.throws(() => commonObjectExtra(Buffer.alloc(45)), /TruncatedDescriptionLength/);
  const truncated = Buffer.alloc(48);
  truncated.writeUInt16LE(2, 44);
  assert.throws(() => commonObjectExtra(truncated), /TruncatedObjectDescription/);
});

test('actual thirty opaque tails remain observations rather than inferred terminators', () => {
  const input = readFileSync('reference/rhwp/samples/HWP5-nopassword-123456.hwp'),
    original = Buffer.from(input);
  const result = surveyDocument(input);
  assert.equal(result.status, 'observed');
  assert.equal(result.objects, 30);
  assert.deepEqual(result.groups, [
    { descriptionUnits: 0, extraBytes: 2, extraHex: '0000', count: 30 },
  ]);
  assert.equal(result.inputUnchanged, true);
  assert.deepEqual(input, original);
});

test('short control headers stay unparsed and do not erase other observations', () => {
  for (const name of ['20250130-hongbo_saved.hwp', 'honbo-save.hwp']) {
    const result = surveyDocument(readFileSync(`reference/rhwp/samples/${name}`));
    assert.equal(result.status, 'partially_observed');
    assert.equal(result.unparsedObjects.length, 5);
    assert(
      result.unparsedObjects.every(
        (row) => row.bytes === 40 && row.error === 'TruncatedCommonObject',
      ),
    );
    assert.equal(
      result.groups.reduce((sum, group) => sum + group.count, 0) + result.unparsedObjects.length,
      result.objects,
    );
    assert.equal(result.inputUnchanged, true);
  }
});
