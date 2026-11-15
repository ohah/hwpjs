import { createCommand } from './commands.ts';
import {
  ownObjectGeometryRecord,
  checkedObjectGeometryPatch,
} from '../../../../js/object-geometry-edit.mjs';
import type {
  ObjectGeometryObservation,
  ObjectGeometryPatch,
  ObjectGeometrySelector,
  ObjectGeometryFrame,
} from '../../../../js/object-geometry-edit.mjs';
export type {
  ObjectGeometryObservation,
  ObjectGeometryPatch,
  ObjectGeometrySelector,
  ObjectGeometryFrame,
};
declare const objectGeometryTarget: unique symbol;
/** Editor-issued exact current Native owner; a query observation is not this authority. */
export interface ObjectGeometryTarget {
  readonly [objectGeometryTarget]: true;
}
export interface SetObjectGeometryPayload {
  readonly target: ObjectGeometryTarget;
  readonly patch: ObjectGeometryPatch;
}
export type ObjectGeometryRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: ObjectGeometryTarget;
      observation: ObjectGeometryObservation;
    }>;
export const SET_OBJECT_GEOMETRY_COMMAND =
  createCommand<SetObjectGeometryPayload>('set-object-geometry');
export function captureObjectGeometryPayload(value: unknown): SetObjectGeometryPayload {
  const p = ownObjectGeometryRecord(value, ['target', 'patch']);
  if (!p.target || typeof p.target !== 'object') throw Error('InvalidObjectGeometryTarget');
  return Object.freeze({
    target: p.target,
    patch: checkedObjectGeometryPatch(p.patch),
  }) as SetObjectGeometryPayload;
}
