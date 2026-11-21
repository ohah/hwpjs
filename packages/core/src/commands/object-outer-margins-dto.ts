import type {
  Hwp5OuterMarginsSelector,
  Hwp5OuterMarginsObservation,
  Hwp5OuterMarginsRequest,
} from './hwp5-object-outer-margins-dto.ts';
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
export type ObjectOuterMarginsSelector =
  | Hwp5OuterMarginsSelector
  | Readonly<{
      kind: 'drawing';
      section: number;
      node: number;
    }>;
/** Internal Native wire data; public callers cannot turn it into command authority. */
export type NativeObjectOuterMarginsObservation =
  | Hwp5OuterMarginsObservation
  | HwpxObjectOuterMarginsObservation;
export type HwpxObjectOuterMarginsObservation = Readonly<{
  geometry: ObjectGeometryObservation &
    Readonly<{
      format: 'hwpx';
      selector: Extract<ObjectOuterMarginsSelector, { kind: 'drawing' }>;
    }>;
  margins: ObjectOuterMargins;
  verticalOnly?: true;
}>;
export type NativeObjectOuterMarginsRequest = Readonly<{
  geometry: Readonly<{
    selector: Extract<ObjectOuterMarginsSelector, { kind: 'drawing' }>;
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
        format: 'hwpx' | 'hwp5';
        kind?: 'drawing' | 'picture' | 'textbox';
        section: number;
        drawingNode: number;
        margins: ObjectOuterMargins;
        /** Present only for qualified HWPX TOP_AND_BOTTOM. Not command authority. */
        verticalOnly?: true;
      }>;
    }>;
export type SetObjectOuterMarginsPayload = Readonly<{
  target: ObjectOuterMarginsTarget;
  margins: ObjectOuterMargins;
}>;
export type ObjectOuterMarginsMessage = {
  kind: 'object-outer-margins-set';
  request: NativeObjectOuterMarginsRequest | Hwp5OuterMarginsRequest;
};
