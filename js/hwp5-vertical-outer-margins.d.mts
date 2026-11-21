import type { Hwp5OuterMarginsSelector } from '../packages/core/src/commands/hwp5-object-outer-margins-dto.ts';
import type {
  Hwp5VerticalMarginsObservation,
  Hwp5VerticalMarginsRequest,
} from '../packages/core/src/commands/hwp5-vertical-margins-dto.ts';
import type { NativeEditOutcome } from '../packages/core/src/contracts/native-edit-outcome.ts';
export const HWP5_VERTICAL_MARGINS_PROFILE: 'hwp5-observed-vertical-outer-margins-v1';
export function checkedHwp5VerticalMarginsObservation(v: unknown): Hwp5VerticalMarginsObservation;
export function checkedHwp5VerticalMarginsRequest(v: unknown): Hwp5VerticalMarginsRequest;
export function createHwp5VerticalMarginsApi(v: unknown): {
  supportsVerticalObjectOuterMargins(): boolean;
  verticalObjectOuterMargins(v: Hwp5OuterMarginsSelector): Hwp5VerticalMarginsObservation;
  setVerticalObjectOuterMargins(v: Hwp5VerticalMarginsRequest): NativeEditOutcome;
};
