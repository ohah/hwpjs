import { createCommand } from './commands.ts';
import { ownObjectGeometryRecord } from '../../../../js/object-geometry-edit.mjs';
import {
  checkedObjectOuterMargins,
  checkedObjectOuterMarginsObservation,
  checkedObjectOuterMarginsRequest,
} from '../../../../js/object-outer-margins.mjs';
import type {
  SetObjectOuterMarginsPayload,
  ObjectOuterMarginsTarget,
  NativeObjectOuterMarginsObservation,
  ObjectOuterMarginsMessage,
  ObjectOuterMargins,
} from './object-outer-margins-dto.ts';
export type {
  ObjectOuterMargins,
  ObjectOuterMarginsSelector,
  ObjectOuterMarginsTarget,
  ObjectOuterMarginsRead,
  SetObjectOuterMarginsPayload,
} from './object-outer-margins-dto.ts';
export const SET_OBJECT_OUTER_MARGINS_COMMAND = createCommand<SetObjectOuterMarginsPayload>(
  'set-object-outer-margins',
);
export function captureObjectOuterMarginsPayload(value: unknown): SetObjectOuterMarginsPayload {
  const p = ownObjectGeometryRecord(value, ['target', 'margins']);
  if (!p.target || typeof p.target !== 'object' || Array.isArray(p.target))
    throw Error('InvalidObjectOuterMarginsTarget');
  return Object.freeze({
    target: p.target as ObjectOuterMarginsTarget,
    margins: checkedObjectOuterMargins(p.margins),
  });
}
export function objectOuterMarginsMessage(
  value: NativeObjectOuterMarginsObservation,
  margins: ObjectOuterMargins,
): ObjectOuterMarginsMessage {
  const before = checkedObjectOuterMarginsObservation(value),
    g = before.geometry;
  return {
    kind: 'object-outer-margins-set',
    request: checkedObjectOuterMarginsRequest({
      geometry: {
        selector: g.selector,
        owner: g.owner,
        expected: g.frame,
        historyRevision: g.historyRevision,
        binding: g.binding,
        patch: {},
      },
      expectedMargins: before.margins,
      margins,
    }),
  };
}
