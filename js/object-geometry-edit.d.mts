import type {
  ObjectGeometrySelector,
  ObjectGeometryFrame,
  ObjectGeometryPatch,
  ObjectGeometryOwner,
  ObjectGeometryObservation,
} from '../packages/core/src/commands/object-geometry-dto.ts';
export type {
  ObjectGeometrySelector,
  ObjectGeometryFrame,
  ObjectGeometryPatch,
  ObjectGeometryOwner,
  ObjectGeometryObservation,
} from '../packages/core/src/commands/object-geometry-dto.ts';
export function ownObjectGeometryRecord(
  value: unknown,
  allowed: readonly string[],
  required?: readonly string[],
): Record<string, any>;
export function checkedObjectGeometrySelector(value: unknown): ObjectGeometrySelector;
export function checkedObjectGeometryPatch(value: unknown): ObjectGeometryPatch;
export function checkedObjectGeometryFrame(value: unknown): ObjectGeometryFrame;
export function checkedObjectGeometryOwner(value: unknown): ObjectGeometryOwner;
export function checkedObjectGeometryObservation(value: unknown): ObjectGeometryObservation;
export function objectGeometryMessage(
  observation: ObjectGeometryObservation,
  patch: ObjectGeometryPatch,
): Readonly<{
  kind: 'object-geometry-set';
  request: Readonly<{
    selector: ObjectGeometrySelector;
    owner: ObjectGeometryOwner;
    expected: ObjectGeometryFrame;
    historyRevision: number;
    binding: Readonly<{ session: string; serial: string }>;
    patch: ObjectGeometryPatch;
  }>;
}>;
