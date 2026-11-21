import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyFlowValues, checkedBodyFlow } from '../src/object-body-flow-input.ts';
const original = { textWrap: 'SQUARE', textFlow: 'RIGHT_ONLY' };
test('every non-square mode retains original side', () => {
  for (const textWrap of ['TOP_AND_BOTTOM', 'BEHIND_TEXT', 'IN_FRONT_OF_TEXT'])
    assert.deepEqual(bodyFlowValues({ textWrap, textFlow: 'LEFT_ONLY' }, original), {
      textWrap,
      textFlow: 'RIGHT_ONLY',
    });
});
test('square allows explicit side', () =>
  assert.deepEqual(bodyFlowValues({ textWrap: 'SQUARE', textFlow: 'LEFT_ONLY' }, original), {
    textWrap: 'SQUARE',
    textFlow: 'LEFT_ONLY',
  }));
test('null missing and unknown enums are not defaults', () => {
  for (const x of [
    null,
    {},
    { textWrap: null, textFlow: 'BOTH_SIDES' },
    { textWrap: 'SQUARE', textFlow: 'unknown' },
  ])
    assert.throws(() => checkedBodyFlow(x));
});
