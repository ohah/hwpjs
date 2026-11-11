import type { ParagraphBulletDefinition } from '../commands/paragraph-bullet-definition.ts';
import type { StateToken } from '../state/editor-state.ts';
export interface ParagraphBulletDeclaration {
  readonly ordinal: number;
  readonly id: number | null;
  readonly marker: number | null;
  /** Eligibility of this definition for the existing writer, independent of the target. */
  readonly canApply: boolean;
  /** Null/absent means geometry was not fully observed; no inferred defaults. */
  readonly definition?: ParagraphBulletDefinition | null;
  readonly reason: 'InvalidBulletId' | 'DuplicateBulletId' | 'UnsupportedBulletDeclaration' | null;
}
export type ParagraphBulletDefinitions =
  | { readonly state: 'unavailable'; readonly reason: string }
  | {
      readonly schemaVersion: 1;
      readonly state: 'available';
      readonly scope: 'current-header';
      readonly coverage: 'complete';
      readonly definitionWriter?: 'character-definitions-v1';
      readonly declarations: readonly ParagraphBulletDeclaration[];
    };
export interface ParagraphBulletDefinitionsOptions {
  readonly token?: StateToken;
}
