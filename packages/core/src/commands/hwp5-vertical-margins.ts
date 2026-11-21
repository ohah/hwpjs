import { createCommand } from './commands.ts';
import { ownObjectGeometryRecord } from '../../../../js/object-geometry-edit.mjs';
import { checkedHwp5VerticalMarginsRequest } from '../../../../js/hwp5-vertical-outer-margins.mjs';
import type {
  Hwp5VerticalMarginsObservation,
  Hwp5VerticalMarginsSetMessage,
  SetHwp5VerticalMarginsPayload,
  Hwp5VerticalMarginsTarget,
} from './hwp5-vertical-margins-dto.ts';

// Separate observed-vertical command; no fallback to Square or HWPX body flow.
export const SET_HWP5_VERTICAL_MARGINS_COMMAND = createCommand<SetHwp5VerticalMarginsPayload>(
  'set-hwp5-vertical-margins',
);
export function captureHwp5VerticalMarginsPayload(value: unknown): SetHwp5VerticalMarginsPayload {
  const v = ownObjectGeometryRecord(value, ['target', 'top', 'bottom']);
  if (!v.target || typeof v.target !== 'object' || Array.isArray(v.target))
    throw Error('InvalidVerticalMarginsTarget');
  for (const n of [v.top, v.bottom])
    if (!Number.isInteger(n) || Object.is(n, -0) || (n as number) < -32768 || (n as number) > 32767)
      throw Error('InvalidVerticalMargins');
  return Object.freeze({
    target: v.target as Hwp5VerticalMarginsTarget,
    top: v.top as number,
    bottom: v.bottom as number,
  });
}
export function hwp5VerticalMarginsMessage(
  before: Hwp5VerticalMarginsObservation,
  top: number,
  bottom: number,
): Hwp5VerticalMarginsSetMessage {
  return {
    kind: 'hwp5-vertical-object-margins-set',
    request: checkedHwp5VerticalMarginsRequest({ ...before, top, bottom }),
  };
}
