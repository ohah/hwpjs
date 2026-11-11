import type { SelectionTarget } from './commands.ts';
export interface ParagraphBulletDefinition {
  readonly marker: number;
  readonly alignment: 'LEFT' | 'CENTER' | 'RIGHT';
  readonly useInstanceWidth: boolean;
  readonly autoIndent: boolean;
  readonly widthAdjust: number;
  readonly textOffsetType: 'PERCENT' | 'HWPUNIT';
  readonly textOffset: number;
  /** Existing current-header character shape, or 0xffffffff for inherited shape. */
  readonly charShapeId: number;
}
export type ParagraphBulletDefinitionEdit =
  | {
      readonly mode: 'create';
      readonly definition: ParagraphBulletDefinition;
      readonly apply: boolean;
    }
  | {
      readonly mode: 'update';
      readonly id: number;
      readonly definition: ParagraphBulletDefinition;
      readonly apply: boolean;
    };
export interface EditParagraphBulletDefinitionPayload {
  readonly target: SelectionTarget;
  readonly selectionVersion: number;
  readonly edit: ParagraphBulletDefinitionEdit;
}
