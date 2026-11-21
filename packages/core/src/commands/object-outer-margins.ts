import {
  checkedHwp5OuterMarginsSelector,
  checkedHwp5OuterMarginsObservation,
  checkedHwp5OuterMarginsRequest,
} from '../../../../js/hwp5-object-outer-margins.mjs';
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
  ObjectOuterMarginsSelector,
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
  if ('format' in value && value.format === 'hwp5')
    return {
      kind: 'object-outer-margins-set',
      request: checkedHwp5OuterMarginsRequest({ schemaVersion: 1, witness: value, margins }),
    };
  const before = checkedObjectOuterMarginsObservation(value),
    g = before.geometry;
  if (
    before.verticalOnly &&
    (margins.left !== before.margins.left || margins.right !== before.margins.right)
  )
    throw Error('UnsupportedObjectOuterMargins');
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

export function checkedOuterMarginsSelector(value: unknown): ObjectOuterMarginsSelector {
  const v = ownObjectGeometryRecord(value, ['kind', 'section', 'node']);
  if (v.kind !== 'drawing') return checkedHwp5OuterMarginsSelector(v);
  // Preserve the existing HX validator and drawing selector semantics.
  return checkedObjectOuterMarginsSelectorDrawing(v);
}
function checkedObjectOuterMarginsSelectorDrawing(v: Record<string, unknown>) {
  if (
    !Number.isInteger(v.section) ||
    !Number.isInteger(v.node) ||
    Object.is(v.section, -0) ||
    Object.is(v.node, -0) ||
    (v.section as number) < 0 ||
    (v.node as number) < 0 ||
    (v.section as number) > 0xffffffff ||
    (v.node as number) > 0xffffffff
  )
    throw Error('InvalidObjectOuterMarginsSelector');
  return Object.freeze({
    kind: 'drawing' as const,
    section: v.section as number,
    node: v.node as number,
  });
}
export function outerMarginsIdentity(v: NativeObjectOuterMarginsObservation): {
  format: 'hwpx' | 'hwp5';
  selector: ObjectOuterMarginsSelector;
  historyRevision: number;
} {
  if ('format' in v && v.format === 'hwp5')
    return { format: v.format, selector: v.selector, historyRevision: v.historyRevision };
  const hx = checkedObjectOuterMarginsObservation(v);
  return {
    format: hx.geometry.format,
    selector: hx.geometry.selector,
    historyRevision: hx.geometry.historyRevision,
  };
}
export function checkedOuterMarginsObservation(
  value: unknown,
): NativeObjectOuterMarginsObservation {
  const descriptor =
    value && typeof value === 'object'
      ? Object.getOwnPropertyDescriptor(value, 'format')
      : undefined;
  if (descriptor && 'value' in descriptor && descriptor.value === 'hwp5')
    return checkedHwp5OuterMarginsObservation(value);
  return checkedObjectOuterMarginsObservation(value);
}
