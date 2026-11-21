import type {
  Hwp5OuterMarginsObservation,
  Hwp5OuterMarginsSelector,
} from './hwp5-object-outer-margins-dto.ts';

/** Observed compact raw1 vertical exclusion; never official Tight support. */
export type Hwp5VerticalMarginsProfile = 'hwp5-observed-vertical-outer-margins-v1';
export type Hwp5VerticalMarginsObservation = Readonly<{
  schemaVersion: 1;
  profile: Hwp5VerticalMarginsProfile;
  witness: Hwp5OuterMarginsObservation;
}>;
/** Signed old words may be retained exactly; newly changed values must be nonnegative. */
export type Hwp5VerticalMarginsValues = Readonly<{ top: number; bottom: number }>;
export type Hwp5VerticalMarginsRequest = Hwp5VerticalMarginsObservation & Hwp5VerticalMarginsValues;
export type Hwp5VerticalMarginsQueryMessage = Readonly<{
  kind: 'hwp5-vertical-object-margins-query';
  selector: Hwp5OuterMarginsSelector;
}>;
export type Hwp5VerticalMarginsSetMessage = Readonly<{
  kind: 'hwp5-vertical-object-margins-set';
  request: Hwp5VerticalMarginsRequest;
}>;

declare const verticalMarginsTarget: unique symbol;
export interface Hwp5VerticalMarginsTarget {
  readonly [verticalMarginsTarget]: true;
}
/** Public owner is issued only behind the qualified builtin runtime admission. */
export type SetHwp5VerticalMarginsPayload = Readonly<{
  target: Hwp5VerticalMarginsTarget;
  top: number;
  bottom: number;
}>;

export type Hwp5VerticalMarginsSelector = Hwp5OuterMarginsSelector;
export type Hwp5VerticalMarginsRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: Hwp5VerticalMarginsTarget;
      observation: Readonly<{
        format: 'hwp5';
        selector: Hwp5VerticalMarginsSelector;
        left: number;
        right: number;
        top: number;
        bottom: number;
      }>;
    }>;
