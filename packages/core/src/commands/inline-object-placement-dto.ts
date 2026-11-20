// Core owns public placement DTOs. No Native/runtime/DOM dependencies.
export interface InlineObjectBinding {
  readonly session: string;
  readonly revision: number;
  readonly serial: string;
}
export type InlineObjectOwner =
  | { readonly kind: 'body'; readonly binding: InlineObjectBinding }
  | {
      readonly kind: 'sourceCell';
      readonly binding: InlineObjectBinding;
      readonly table_node: number;
      readonly list_node: number;
    }
  | {
      readonly kind: 'createdCell';
      readonly binding: InlineObjectBinding;
      readonly identity: string;
      readonly row: number;
      readonly column: number;
    };
/** paragraph uses the Native document-global one-based ordinal. Generated
 * cells use the separate logical address and never a paragraph placeholder. */
export type InlineObjectSelector = { readonly section: number } & (
  | { readonly paragraph: number; readonly created_cell?: never }
  | {
      readonly paragraph?: never;
      readonly created_cell: {
        readonly identity: string;
        readonly row: number;
        readonly column: number;
      };
    }
);
export type InlineObjectAddress = { readonly section: number } & (
  | { readonly paragraph: number; readonly owner?: never; readonly affinity?: never }
  | {
      readonly paragraph: number;
      readonly owner: Exclude<InlineObjectOwner, { kind: 'createdCell' }>;
      readonly affinity?: 'forward' | 'backward';
    }
  | {
      readonly paragraph?: never;
      readonly owner: Extract<InlineObjectOwner, { kind: 'createdCell' }>;
      readonly affinity?: 'forward' | 'backward';
    }
);
export type InlineObjectOwnedAddress = Extract<
  InlineObjectAddress,
  { readonly owner: InlineObjectOwner }
>;
export type InlineObjectObservation = InlineObjectOwnedAddress & {
  readonly schemaVersion: 1;
  readonly expected_text: string;
};
