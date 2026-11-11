export interface PageSettingsValues {
  readonly orientation: 'widely' | 'narrowly';
  readonly width: number;
  readonly height: number;
  readonly gutter_type: 'left_only' | 'left_right' | 'top_bottom';
  readonly margin: Readonly<{
    header: number;
    footer: number;
    gutter: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }>;
}
export interface PageSettingsBinding {
  readonly session: string;
  readonly revision: number;
  readonly serial: string;
}
export interface HwpxPageSettingsSnapshot {
  readonly section_ordinal: number;
  readonly element_index: number;
  readonly orientation: 'widely' | 'narrowly' | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly gutter_type: 'left_only' | 'left_right' | 'top_bottom' | null;
  readonly margin: Readonly<{
    header: number | null;
    footer: number | null;
    gutter: number | null;
    left: number | null;
    right: number | null;
    top: number | null;
    bottom: number | null;
  }> | null;
  readonly duplicate_margins: number;
  readonly hide_first_empty_line: boolean | null;
  readonly visibility_count: number;
}
export interface Hwp5PageSettingsSnapshot {
  readonly source_node: number;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly header: number;
  readonly footer: number;
  readonly gutter: number;
  readonly flags: number;
  readonly orientation: 'narrowly' | 'widely';
  readonly binding: 'one_side' | 'facing' | 'top';
  readonly extra_bytes: number;
}
export interface HwpxPageSettingsTarget {
  readonly section: number;
  readonly owner_node: number;
  readonly page_node: number;
  readonly margin_node: number | null;
  readonly expected: HwpxPageSettingsSnapshot;
}
export interface Hwp5PageSettingsTarget {
  readonly section: number;
  readonly expected: Hwp5PageSettingsSnapshot;
}
export type HwpxPageSettingsUnavailableReason =
  | 'MissingPageSettings'
  | 'AmbiguousPageSettings'
  | 'DuplicatePageMargin'
  | 'UnsupportedPageSettingsOwner';
export type Hwp5PageSettingsUnavailableReason =
  | 'MissingPageDefinition'
  | 'DuplicatePageDefinition'
  | 'MissingSectionDefinition'
  | 'DuplicateSectionDefinition'
  | 'OrphanSectionRecord'
  | 'MisplacedSectionDefinition'
  | 'OrphanSectionDefinition'
  | 'UnsupportedPageBinding'
  | 'UnsupportedPageSettingsOwner';
export type PageSettingsOwner<T, R> =
  | Readonly<{ section: number; target: T; reason: null }>
  | Readonly<{ section: number; target: null; reason: R }>;
export interface HwpxPageSettingsCapabilities {
  readonly schemaVersion: 1;
  readonly format: 'hwpx';
  readonly binding: PageSettingsBinding;
  readonly sections: readonly PageSettingsOwner<
    HwpxPageSettingsTarget,
    HwpxPageSettingsUnavailableReason
  >[];
}
export interface Hwp5PageSettingsCapabilities {
  readonly schemaVersion: 1;
  readonly format: 'hwp5';
  readonly binding: PageSettingsBinding;
  readonly sections: readonly PageSettingsOwner<
    Hwp5PageSettingsTarget,
    Hwp5PageSettingsUnavailableReason
  >[];
}
export type PageSettingsCapabilities = HwpxPageSettingsCapabilities | Hwp5PageSettingsCapabilities;
interface PageSettingsWriteRequestBase<T> {
  readonly binding: PageSettingsBinding;
  readonly scope: 'section' | 'document';
  readonly targets: readonly T[];
  readonly values: PageSettingsValues;
}
export type PageSettingsWriteRequest<
  T extends HwpxPageSettingsTarget | Hwp5PageSettingsTarget =
    | HwpxPageSettingsTarget
    | Hwp5PageSettingsTarget,
> = T extends unknown ? PageSettingsWriteRequestBase<T> : never;
interface CompletionMeta {
  readonly cleanupError?: string;
  readonly refreshRequired?: true;
}
export type PageSettingsWriteOutcome =
  | (CompletionMeta &
      Readonly<{ nativeCode: 0; application: 'unapplied'; changed: false; error: string }>)
  | (CompletionMeta &
      Readonly<{ nativeCode: 1; application: 'applied'; changed: true; error?: never }>)
  | (CompletionMeta &
      Readonly<{ nativeCode: 2; application: 'unapplied'; changed: false; error?: never }>)
  | (CompletionMeta &
      Readonly<{ nativeCode: 3; application: 'unknown'; changed: null; error: string }>)
  | (CompletionMeta &
      Readonly<{ nativeCode?: undefined; application: 'unknown'; changed: null; error: string }>);
export interface PageSettingsEditApi {
  supportsPageSettingsWrite(): boolean;
  pageSettingsCapabilities(): PageSettingsCapabilities;
  writePageSettings(request: PageSettingsWriteRequest): PageSettingsWriteOutcome;
}
