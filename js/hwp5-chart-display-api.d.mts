export interface Hwp5ChartGeometry {
  readonly control_node: number;
  readonly component_node: number;
  readonly paragraph_node: number;
  readonly kind_id: number;
  readonly flags: number;
  readonly offset_x: number;
  readonly offset_y: number;
  readonly width: number;
  readonly height: number;
  readonly instance_id: number;
  readonly z_order: number;
  readonly outer_margins: readonly [number, number, number, number];
  readonly prevent_page_break: number;
  readonly description_bytes: number | null;
  readonly object_extra_bytes: number;
  readonly component_offset_x: number;
  readonly component_offset_y: number;
  readonly original_width: number;
  readonly original_height: number;
  readonly current_width: number;
  readonly current_height: number;
  readonly component_attributes: number;
  readonly rotation_angle: number;
  readonly matrix_pairs: number;
  readonly component_extra_bytes: number;
}
export interface Hwp5ChartOwner {
  /** Hash of the queried physical section basis, not edit authority. */
  readonly section_source_sha256: readonly number[];
  readonly control_node: number;
  readonly component_node: number;
  readonly ole_node: number;
  readonly paragraph_node: number;
  readonly paragraph: number;
  readonly source_unit: number;
  readonly current_unit: number;
  readonly ordinal: number;
  readonly ole_layout: 'spec24' | 'observed26';
  readonly attributes: number;
  readonly extent_x: number;
  readonly extent_y: number;
  readonly opaque_tail_bytes: number;
  readonly geometry: Hwp5ChartGeometry;
}
export interface ChartDisplayData {
  readonly plots: readonly {
    readonly node: number;
    readonly area_node: number;
    readonly kind: string;
    readonly series_nodes: readonly number[];
  }[];
  readonly points: readonly {
    readonly cache_node: number;
    readonly level_node: number | null;
    readonly point_node: number;
    readonly value_node: number;
    readonly index: number;
    readonly kind: string;
    readonly value: string;
  }[];
  readonly plot_settings: readonly Readonly<Record<string, unknown>>[];
  readonly series_settings: readonly Readonly<Record<string, unknown>>[];
  readonly point_settings: readonly Readonly<Record<string, unknown>>[];
  readonly axes: readonly Readonly<Record<string, unknown>>[];
  readonly axis_links: readonly Readonly<Record<string, unknown>>[];
  readonly bindings: readonly Readonly<Record<string, unknown>>[];
  readonly series_text: readonly Readonly<Record<string, unknown>>[];
  readonly rich_text: readonly Readonly<Record<string, unknown>>[];
  readonly view_3d: Readonly<Record<string, unknown>> | null;
  readonly blank_policy: Readonly<Record<string, unknown>> | null;
}
export type Hwp5ChartResource =
  | {
      readonly state: 'modern_chart';
      readonly physical_id: number;
      readonly resource_sha256: readonly number[];
      readonly stream_entry: number;
      readonly legacy_backup_present: boolean;
      readonly presentation_streams: number;
      readonly error_name: null;
    }
  | {
      readonly state: 'unresolved_ole' | 'unavailable';
      readonly physical_id: null;
      readonly resource_sha256: null;
      readonly stream_entry: null;
      readonly legacy_backup_present: null;
      readonly presentation_streams: null;
      readonly error_name: string;
    };
interface Hwp5ChartEnvelope {
  readonly format: 'hwp5';
  readonly version: 1;
  readonly source_epoch: string;
  readonly history_revision: number | null;
}
export interface Hwp5ChartCandidates extends Hwp5ChartEnvelope {
  readonly kind: 'hwp5_chart_candidates';
  readonly candidates: readonly {
    readonly section: number;
    readonly owner: Hwp5ChartOwner;
    readonly resource: Hwp5ChartResource;
  }[];
}
export interface Hwp5ChartDisplay extends Hwp5ChartEnvelope {
  readonly kind: 'hwp5_chart_display';
  readonly physical_id: number;
  readonly section: number;
  readonly owner: Hwp5ChartOwner;
  readonly resource_sha256: readonly number[];
  readonly stream_entry: number;
  readonly legacy_backup_present: boolean;
  readonly presentation_streams: number;
  readonly data: ChartDisplayData;
}
export function decodeHwp5ChartCandidates(bytes: Uint8Array): Hwp5ChartCandidates;
export function decodeHwp5ChartDisplay(bytes: Uint8Array): Hwp5ChartDisplay;
export interface Hwp5ChartReadExports extends Readonly<Record<string, unknown>> {
  readonly hwp5_edit_chart_display_profile_version?: () => number;
  readonly hwp5_edit_chart_candidates?: () => number;
  readonly hwp5_edit_chart_display?: (section: number, control: number) => number;
}
export function createHwp5ChartDisplayApi(options: {
  readonly wasm: Hwp5ChartReadExports;
  check(): void;
  output(action: () => number): { readonly bytes: Uint8Array };
  u32(value: unknown, name: string): number;
}): {
  supportsHwp5ChartDisplayAbi(): boolean;
  hwp5ChartCandidates(): Hwp5ChartCandidates;
  hwp5ChartDisplay(section: number, control: number): Hwp5ChartDisplay;
};
