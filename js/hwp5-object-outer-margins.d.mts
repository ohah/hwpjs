import type { Hwp5OuterMarginsSelector, Hwp5OuterMarginsObservation, Hwp5OuterMarginsRequest } from '../packages/core/src/commands/hwp5-object-outer-margins-dto.ts';
export type { Hwp5OuterMarginsSelector, Hwp5OuterMarginsObservation, Hwp5OuterMarginsRequest } from '../packages/core/src/commands/hwp5-object-outer-margins-dto.ts';
import type { NativeEditOutcome } from '../packages/core/src/contracts/native-edit-outcome.ts';
export function checkedHwp5OuterMarginsSelector(v: unknown): Hwp5OuterMarginsSelector;
export function checkedHwp5OuterMarginsObservation(v: unknown): Hwp5OuterMarginsObservation;
export function checkedHwp5OuterMarginsRequest(v: unknown): Hwp5OuterMarginsRequest;
export function createHwp5OuterMarginsApi(v: unknown): {
  supportsObjectOuterMargins(): boolean;
  objectOuterMargins(v: Hwp5OuterMarginsSelector): Hwp5OuterMarginsObservation;
  setObjectOuterMargins(v: Hwp5OuterMarginsRequest): NativeEditOutcome;
};
