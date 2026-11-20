/** Native readonly projection; never an editor target or write capability. */
export type ControlTextCoverage = 'complete' | 'partial';
export type ControlTextKind = 'tab' | 'anchor' | 'nb_space' | 'fw_space' | 'line_break' | 'hypen';
export interface ControlTextUnit {
  readonly kind: ControlTextKind;
  readonly node: number;
  readonly startUnit: number;
  readonly endUnit: number;
}
export type ControlTextIssue =
  | 'UnknownControl'
  | 'UnresolvedField'
  | 'MissingCurrentSite'
  | 'InconsistentControlOwner';
export interface ControlTextRow {
  readonly paragraph: number;
  readonly sourceNode: number;
  readonly plain: string;
  readonly text: string | null;
  readonly units: number;
  readonly controls: readonly ControlTextUnit[];
  readonly coverage: ControlTextCoverage;
  readonly issue: ControlTextIssue | null;
}
export interface ControlTextSnapshot {
  readonly schemaVersion: 1 | 2;
  readonly axis: 'native-control-utf16';
  readonly section: number;
  /** v1: Session mutation serial. v2: external read generation. Neither is an edit token. */
  readonly readStamp: Readonly<{ session: string; serial: string }>;
  readonly coverage: ControlTextCoverage;
  readonly rows: readonly ControlTextRow[];
}
export interface ControlTextReadApi {
  supportsParagraphControlTextSnapshotAbi(): boolean;
  paragraphControlTextSnapshot(section: number): ControlTextSnapshot;
}

export interface ControlTextReadIdentity {
  readonly schemaVersion: 1;
  readonly scope: 'native-control-text-identity';
  readonly executionAuthority: false;
  readonly section: number;
  readonly firstParagraph: number;
  readonly paragraphCount: number;
  readonly readBinding: Readonly<{ session: string; epoch: string; serial: string }>;
}
