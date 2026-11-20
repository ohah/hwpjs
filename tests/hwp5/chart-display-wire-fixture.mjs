import { chartFamilyFieldNames } from '../../js/chart-family-display-settings.mjs';
import { model, proposed } from '../hwpx/chart-family-model.mjs';
// Authored transport fields and generic chart data. Not actual Native/GUI output.
export function chartData() {
  const {
    pair: _pair,
    host: _host,
    kind: _kind,
    ...data
  } = proposed(model('doughnutChart', [[1, 2]]));
  for (const key of chartFamilyFieldNames)
    if (!Object.hasOwn(data.plot_settings[0], key)) data.plot_settings[0][key] = null;
  return data;
}
export function owner() {
  const geometry = {
    control_node: 4,
    component_node: 5,
    paragraph_node: 0,
    kind_id: 0x246f6c65,
    flags: 1 | (1 << 2) | (2 << 3) | (3 << 8) | (4 << 15) | (2 << 18),
    offset_x: 0,
    offset_y: 0,
    width: 18000,
    height: 12000,
    instance_id: 1,
    z_order: 0,
    outer_margins: [0, 0, 0, 0],
    prevent_page_break: 0,
    description_bytes: 0,
    object_extra_bytes: 0,
    component_offset_x: 0,
    component_offset_y: 0,
    original_width: 18000,
    original_height: 12000,
    current_width: 18000,
    current_height: 12000,
    component_attributes: 0,
    rotation_angle: 0,
    matrix_pairs: 1,
    component_extra_bytes: 0,
  };
  return {
    section_source_sha256: Array(32).fill(23),
    control_node: 4,
    component_node: 5,
    ole_node: 6,
    paragraph_node: 0,
    paragraph: 0,
    source_unit: 16,
    current_unit: 16,
    ordinal: 1,
    ole_layout: 'observed26',
    attributes: 65537,
    extent_x: 18000,
    extent_y: 12000,
    opaque_tail_bytes: 0,
    geometry,
  };
}
export function display() {
  return {
    kind: 'hwp5_chart_display',
    format: 'hwp5',
    version: 1,
    section: 2,
    source_epoch: '9',
    history_revision: 3,
    owner: owner(),
    resource_sha256: Array(32).fill(17),
    physical_id: 1,
    stream_entry: 1,
    legacy_backup_present: false,
    presentation_streams: 0,
    data: chartData(),
  };
}
export function candidates() {
  const value = display();
  return {
    kind: 'hwp5_chart_candidates',
    format: 'hwp5',
    version: 1,
    source_epoch: value.source_epoch,
    history_revision: value.history_revision,
    candidates: [
      {
        section: 2,
        owner: value.owner,
        resource: {
          state: 'modern_chart',
          physical_id: value.physical_id,
          resource_sha256: value.resource_sha256,
          stream_entry: value.stream_entry,
          legacy_backup_present: false,
          presentation_streams: 0,
          error_name: null,
        },
      },
    ],
  };
}
export const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
