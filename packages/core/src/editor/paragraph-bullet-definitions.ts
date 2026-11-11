import type { StateToken } from '../state/editor-state.ts';
export interface ParagraphBulletDeclaration {
  readonly ordinal: number;
  readonly id: number | null;
  readonly marker: number | null;
  /** Eligibility of this definition for the existing writer, independent of the target. */
  readonly canApply: boolean;
  readonly reason: 'InvalidBulletId' | 'DuplicateBulletId' | 'UnsupportedBulletDeclaration' | null;
}
export type ParagraphBulletDefinitions =
  | { readonly state: 'unavailable'; readonly reason: string }
  | {
      readonly schemaVersion: 1;
      readonly state: 'available';
      readonly scope: 'current-header';
      readonly coverage: 'complete';
      readonly declarations: readonly ParagraphBulletDeclaration[];
    };
export interface ParagraphBulletDefinitionsOptions {
  readonly token?: StateToken;
}
