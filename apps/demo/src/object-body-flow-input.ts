import type { ObjectBodyFlow } from '@hwpjs/core';
export const bodyFlowWraps = [
  'SQUARE',
  'TOP_AND_BOTTOM',
  'BEHIND_TEXT',
  'IN_FRONT_OF_TEXT',
] as const;
export const bodyFlowSides = ['BOTH_SIDES', 'LEFT_ONLY', 'RIGHT_ONLY', 'LARGEST_ONLY'] as const;
export type BodyFlowDraft = Readonly<{ textWrap: string; textFlow: string }>;
export function checkedBodyFlow(value: BodyFlowDraft): ObjectBodyFlow {
  if (
    !value ||
    !bodyFlowWraps.includes(value.textWrap as ObjectBodyFlow['textWrap']) ||
    !bodyFlowSides.includes(value.textFlow as ObjectBodyFlow['textFlow'])
  )
    throw Error('InvalidObjectBodyFlow');
  return {
    textWrap: value.textWrap as ObjectBodyFlow['textWrap'],
    textFlow: value.textFlow as ObjectBodyFlow['textFlow'],
  };
}
/** A disabled side control never changes its original Native enum. */
export function bodyFlowValues(draft: BodyFlowDraft, original: ObjectBodyFlow): ObjectBodyFlow {
  const value = checkedBodyFlow(draft),
    before = checkedBodyFlow(original);
  return {
    ...value,
    textFlow: value.textWrap === 'SQUARE' ? value.textFlow : before.textFlow,
  };
}
export function sameBodyFlow(a: ObjectBodyFlow, b: ObjectBodyFlow) {
  return a.textWrap === b.textWrap && a.textFlow === b.textFlow;
}
