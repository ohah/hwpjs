import type {
  ObjectGeometryFrame,
  ObjectGeometryOwner,
  ObjectGeometryObservation,
} from './object-geometry-dto.ts';

/** Initial write policy: each integer is 0..32767 source units; absent is never zero. */
export type ObjectOuterMargins = Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}>;
export type ObjectOuterMarginsSelector = Readonly<{
  kind: 'drawing';
  section: number;
  node: number;
}>;
/** Internal Native wire data; public callers cannot turn it into command authority. */
export type NativeObjectOuterMarginsObservation = Readonly<{
  geometry: ObjectGeometryObservation &
    Readonly<{
      format: 'hwpx';
      selector: ObjectOuterMarginsSelector;
    }>;
  margins: ObjectOuterMargins;
}>;
export type NativeObjectOuterMarginsRequest = Readonly<{
  geometry: Readonly<{
    selector: ObjectOuterMarginsSelector;
    owner: ObjectGeometryOwner;
    expected: ObjectGeometryFrame;
    historyRevision: number;
    binding: Readonly<{ session: string; serial: string }>;
    patch: Readonly<Record<string, never>>;
  }>;
  expectedMargins: ObjectOuterMargins;
  margins: ObjectOuterMargins;
}>;

declare const objectOuterMarginsTarget: unique symbol;
export interface ObjectOuterMarginsTarget {
  readonly [objectOuterMarginsTarget]: true;
}
/** Reserved portable SDK shape; runtime issuance and public export are not wired yet. */
export type ObjectOuterMarginsRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: ObjectOuterMarginsTarget;
      observation: Readonly<{
        format: 'hwpx';
        section: number;
        drawingNode: number;
        margins: ObjectOuterMargins;
      }>;
    }>;
export type SetObjectOuterMarginsPayload = Readonly<{
  target: ObjectOuterMarginsTarget;
  margins: ObjectOuterMargins;
}>;
export type ObjectOuterMarginsMessage = {
  kind: 'object-outer-margins-set';
  request: NativeObjectOuterMarginsRequest;
};
