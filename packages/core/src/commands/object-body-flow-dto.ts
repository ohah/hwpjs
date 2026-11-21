import type {
  ObjectGeometryFrame,
  ObjectGeometryOwner,
  ObjectGeometryObservation,
} from './object-geometry-dto.ts';

/** Exact source enums; missing or null values are unavailable, never defaults. */
export type ObjectBodyFlow = Readonly<{
  textWrap: 'SQUARE' | 'TOP_AND_BOTTOM' | 'BEHIND_TEXT' | 'IN_FRONT_OF_TEXT';
  textFlow: 'BOTH_SIDES' | 'LEFT_ONLY' | 'RIGHT_ONLY' | 'LARGEST_ONLY';
}>;
export type ObjectBodyFlowSelector = Readonly<{
  kind: 'drawing';
  section: number;
  node: number;
}>;
/** Internal Native wire data; public callers cannot turn it into command authority. */
export type NativeObjectBodyFlowObservation = Readonly<{
  geometry: ObjectGeometryObservation &
    Readonly<{
      format: 'hwpx';
      selector: ObjectBodyFlowSelector;
    }>;
  flow: ObjectBodyFlow;
}>;
export type NativeObjectBodyFlowRequest = Readonly<{
  geometry: Readonly<{
    selector: ObjectBodyFlowSelector;
    owner: ObjectGeometryOwner;
    expected: ObjectGeometryFrame;
    historyRevision: number;
    binding: Readonly<{ session: string; serial: string }>;
    patch: Readonly<Record<string, never>>;
  }>;
  expectedFlow: ObjectBodyFlow;
  flow: ObjectBodyFlow;
}>;

declare const objectBodyFlowTarget: unique symbol;
export interface ObjectBodyFlowTarget {
  readonly [objectBodyFlowTarget]: true;
}
/** Public authority is issued only by the current editor and snapshot. */
export type ObjectBodyFlowRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: ObjectBodyFlowTarget;
      observation: Readonly<{
        format: 'hwpx';
        section: number;
        drawingNode: number;
        flow: ObjectBodyFlow;
      }>;
    }>;
export type SetObjectBodyFlowPayload = Readonly<{
  target: ObjectBodyFlowTarget;
  flow: ObjectBodyFlow;
}>;
export type ObjectBodyFlowMessage = {
  kind: 'object-body-flow-set';
  request: NativeObjectBodyFlowRequest;
};
