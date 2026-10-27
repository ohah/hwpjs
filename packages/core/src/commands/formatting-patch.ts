import type { SelectionTarget } from './commands.ts';
import type { BorderPatch, BackgroundPatch } from './formatting-resource-intent.ts';
export interface ParagraphFormattingPatch {
  readonly alignment?: 'LEFT' | 'RIGHT' | 'CENTER' | 'JUSTIFY' | 'DISTRIBUTE' | 'DISTRIBUTE_SPACE';
  readonly margins?: {
    readonly left?: number;
    readonly right?: number;
    readonly indent?: number;
    readonly before?: number;
    readonly after?: number;
  };
  readonly spacing?: {
    readonly kind: 'percent' | 'fixed' | 'between' | 'at_least';
    readonly value: number;
  };
  readonly grid?: boolean;
  readonly borderConnect?: boolean;
  readonly border?: BorderPatch;
  readonly background?: BackgroundPatch;
}
/** This slice writes paragraph fields only. Native character/reset intents are not exposed here. */
export interface FormattingPatch {
  readonly paragraph: ParagraphFormattingPatch;
}
export interface ApplyFormattingPatchPayload {
  readonly target: SelectionTarget;
  readonly selectionVersion?: number;
  readonly patch: FormattingPatch;
}
export interface SelectionAdmissionFence {
  readonly version: 1;
  readonly commands: readonly ['APPLY_FORMATTING_PATCH'];
  readonly epoch: 'stateVersion';
}
export function assertFormattingAdmission(
  payload: ApplyFormattingPatchPayload,
  stateVersion: number,
  capability: SelectionAdmissionFence | undefined,
): void {
  if (payload.selectionVersion === undefined) return;
  if (!Number.isSafeInteger(payload.selectionVersion) || payload.selectionVersion < 0)
    throw Error('InvalidSelectionVersion');
  if (
    capability?.version !== 1 ||
    capability.epoch !== 'stateVersion' ||
    !capability.commands.includes('APPLY_FORMATTING_PATCH')
  )
    throw Error('SelectionFenceUnavailable');
  if (payload.selectionVersion !== stateVersion) throw Error('StaleFormattingSelection');
}
export type FormattingObservation<T> = (
  | { readonly state: 'known'; readonly value: T }
  | { readonly state: 'mixed' }
  | { readonly state: 'unknown' | 'unavailable'; readonly reason: string }
) &
  (
    | { readonly writable: true; readonly writeUnavailableReason?: never }
    | { readonly writable: false; readonly writeUnavailableReason: string }
  ) & { readonly unit?: string };
export interface FormattingBinding {
  readonly session: string;
  readonly revision: number | null;
}
export interface FormattingNativeTarget {
  readonly ref: string;
  readonly ranges?: readonly { readonly startUnit: number; readonly endUnit: number }[];
}
export interface FormattingQueryResult {
  readonly schemaVersion: 1;
  readonly binding: FormattingBinding;
  readonly targets: readonly FormattingNativeTarget[];
  readonly observations: {
    readonly perTarget: readonly {
      readonly ref: string;
      readonly fields: Readonly<Record<string, FormattingObservation<unknown>>>;
    }[];
    readonly aggregate: Readonly<Record<string, FormattingObservation<unknown>>>;
  };
}
export interface QueryFormattingOptions {
  readonly fields?: readonly string[];
}
export interface FormattingCapabilityOptions {
  readonly token?: import('../state/editor-state.ts').StateToken;
}
export type FormattingCapabilities =
  | { readonly atomic: false; readonly reason: string }
  | {
      readonly schemaVersion: 1;
      readonly atomic: true;
      readonly format: 'hwp5' | 'hwpx';
      readonly requiresHistoryProtocol: 2;
      readonly coordinateSpace: 'native-source-utf16';
      readonly binding: FormattingBinding;
      readonly fields: Readonly<
        Record<
          string,
          {
            readonly readable: boolean;
            readonly writable: boolean;
            readonly writeUnavailableReason?: string;
            readonly reason?: string;
            readonly unit?: string;
            readonly enumValues?: readonly string[];
          }
        >
      >;
      readonly limits: Readonly<
        Record<
          | 'requestBytes'
          | 'replyBytes'
          | 'targets'
          | 'ranges'
          | 'commands'
          | 'fontNameBytes'
          | 'projectionBytes',
          number
        >
      >;
      readonly selectionAdmissionFence?: SelectionAdmissionFence;
    };
