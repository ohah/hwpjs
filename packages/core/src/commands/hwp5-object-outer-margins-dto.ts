import type { ObjectOuterMargins } from './object-outer-margins-dto.ts';
export type Hwp5OuterMarginsSelector = Readonly<{
  section: number;
  node: number;
  kind: 'picture' | 'textbox';
}>;
type Words = Readonly<{ lo: number; hi: number }>;
export type Hwp5OuterMarginsObservation = Readonly<{
  schemaVersion: 1;
  format: 'hwp5';
  selector: Hwp5OuterMarginsSelector;
  owner: Readonly<{
    control_node: number;
    component_node: number;
    paragraph_node: number;
    paragraph: number;
    anchor_unit: number;
    instance_id: number;
    source_sha256: readonly number[];
  }>;
  ticket: Readonly<{ document: Words; generation: Words; owner: Words; epoch: Words }>;
  viewEpoch: Words;
  historyRevision: number;
  margins: ObjectOuterMargins;
  editable: boolean;
  reason: string | null;
  wrapOrdinal: number;
  inline: boolean;
  ownerScope: string;
}>;
export type Hwp5OuterMarginsRequest = Readonly<{
  schemaVersion: 1;
  witness: Hwp5OuterMarginsObservation;
  margins: ObjectOuterMargins;
}>;
