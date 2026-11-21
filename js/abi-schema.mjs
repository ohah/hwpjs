// Authoritative ABI schema. tools/generate-abi.mjs derives the Zig declarations.
// Breaking changes require a version bump and an independently pinned contract test.
export const ABI_VERSION = 6;
// Optional independent readonly owner; never part of required ABI6/editor surface.
export const HWP5_DOCUMENT_TEXT_READ_FUNCTIONS = Object.freeze([
  'hwp5_read_open',
  'hwp5_read_close',
  'hwp5_read_document_text_snapshot',
  'hwp5_read_document_text_anchor',
  'hwp5_read_document_text_selection',
  'hwp5_read_document_text_read_binding',
  'hwp5_read_output_ptr',
  'hwp5_read_output_len',
  'hwp5_read_output_free',
  'hwp5_read_error_ptr',
  'hwp5_read_error_len',
]);

// Optional generated-table grid command codes, shared by both format adapters.
export const CREATED_TABLE_GRID_ACTION = Object.freeze({
  insert_row: 0,
  delete_row: 1,
  insert_column: 2,
  delete_column: 3,
});
// Additive, optional experimental surface; old CFB/read-only consumers remain valid.
export const EXPERIMENTAL_EDITOR_FUNCTIONS = Object.freeze([
  'hwp5_edit_open',
  'hwp5_edit_close',
  'hwp5_edit_section_count',
  'hwp5_edit_paragraph_count',
  'hwp5_edit_char_shape_count',
  'hwp5_edit_copy_text',
  'hwp5_edit_splice',
  'hwp5_edit_format',
  'hwp5_edit_save',
  'hwp5_edit_output_ptr',
  'hwp5_edit_output_len',
  'hwp5_edit_output_free',
  'hwp5_edit_reflow',
]);
// Optional Native control-aware section batch; plain endpoint is unchanged.
export const HWPX_CONTROL_TEXT_READ_FUNCTIONS = Object.freeze([
  'hwpx_edit_paragraph_control_text_snapshot',
  'hwpx_edit_paragraph_control_text_snapshot_current',
  'hwpx_edit_control_text_read_identity',
]);
// Optional existing HWP5 chart reads. u32 values normalize to Wasm i32.
// Names are derived from this signature map, never maintained as a second list.
export const HWP5_CHART_READ_PROFILE_VERSION = 1;
export const HWP5_CHART_READ_ABI = Object.freeze({
  hwp5_edit_chart_display_profile_version: Object.freeze({
    params: Object.freeze([]),
    results: Object.freeze(['i32']),
  }),
  hwp5_edit_chart_candidates: Object.freeze({
    params: Object.freeze([]),
    results: Object.freeze(['i32']),
  }),
  hwp5_edit_chart_display: Object.freeze({
    params: Object.freeze(['i32', 'i32']),
    results: Object.freeze(['i32']),
  }),
});
export const HWP5_CHART_READ_FUNCTIONS = Object.freeze(Object.keys(HWP5_CHART_READ_ABI));
// Optional ordinary-only H5 text transactions; not REQUIRED_FUNCTIONS or UI activation.
export const HWP5_TEXT_TRANSACTION_FUNCTIONS = Object.freeze([
  'hwp5_edit_text_transaction_capabilities',
  'hwp5_edit_query_text_transaction',
  'hwp5_edit_apply_text_transaction',
]);
// Optional ordinary-only HWPX text transactions; ABI6 required surface is unchanged.
export const HWPX_TEXT_TRANSACTION_FUNCTIONS = Object.freeze([
  'hwpx_edit_text_transaction_capabilities',
  'hwpx_edit_query_text_transaction',
  'hwpx_edit_apply_text_transaction',
]);
// Optional read-only HWP5 named field inventory.
export const HWP5_NAMED_FIELDS_FUNCTIONS = Object.freeze(['hwp5_edit_named_fields']);
// Optional read-only source-section field inventory.
export const HWPX_NAMED_FIELDS_FUNCTIONS = Object.freeze(['hwpx_edit_named_fields']);
export const HWPX_NAMED_FIELD_PARAMETERS_FUNCTIONS = Object.freeze([
  'hwpx_edit_named_field_parameters',
  'hwpx_edit_set_named_field_parameters',
]);
export const HWPX_NAMED_FIELD_CREATE_FUNCTIONS = Object.freeze(['hwpx_edit_create_named_field']);
export const HWPX_NAMED_FIELD_RENAME_FUNCTIONS = Object.freeze(['hwpx_edit_rename_named_field']);
// Optional HWPX source-body insertion; required ABI and version are unchanged.
export const HWPX_DOCUMENT_INSERT_FUNCTIONS = Object.freeze([
  'hwpx_edit_document_insert_capabilities',
  'hwpx_edit_insert_document',
]);
// Optional HWPX source-table merge uses the document insertion binding export.
export const HWPX_SOURCE_TABLE_CELL_MERGE_FUNCTIONS = Object.freeze([
  'hwpx_edit_document_insert_capabilities',
  'hwpx_edit_merge_source_table_cells',
]);
// Optional source-cell subdivision retains the existing session/revision/serial ticket.
export const HWP5_SOURCE_TABLE_CELL_SPLIT_FUNCTIONS = Object.freeze([
  'hwp5_edit_source_table_cell_split_capabilities',
  'hwp5_edit_split_source_table_cells',
]);
export const HWPX_SOURCE_TABLE_CELL_SPLIT_FUNCTIONS = Object.freeze([
  'hwpx_edit_document_insert_capabilities',
  'hwpx_edit_split_source_table_cells',
]);
// Optional HWPX provenance; intentionally not part of REQUIRED_FUNCTIONS.
export const HWPX_DOCUMENT_PROVENANCE_FUNCTIONS = Object.freeze(['hwpx_edit_document_provenance']);
export const DOCUMENT = Object.freeze({
  header_bytes: 8,
  node_bytes: 56,
  parent: 0,
  kind: 4,
  name_len: 8,
  content_len: 12,
  state: 16,
  reserved: 20,
  created: 24,
  modified: 32,
  clsid: 40,
});
export const FIELD = Object.freeze({ name: 0, path: 1, content: 2, clsid: 3 });
export const VALUE = Object.freeze({
  kind: 0,
  color: 1,
  left: 2,
  right: 3,
  child: 4,
  state: 5,
  created: 6,
  modified: 7,
  start: 8,
  size: 9,
  uses_fat: 10,
  has_content: 11,
});
export const REQUIRED_FUNCTIONS = Object.freeze([
  'hwpjs_abi_version',
  'cfb_alloc',
  'cfb_free',
  'cfb_open',
  'cfb_open_strict',
  'cfb_find_exact',
  'cfb_write',
  'cfb_document',
  'cfb_output_ptr',
  'cfb_output_len',
  'cfb_output_free',
  'cfb_close',
  'cfb_error_ptr',
  'cfb_error_len',
  'cfb_error_code_ptr',
  'cfb_error_code_len',
  'cfb_count',
  'cfb_find',
  'cfb_find_snapshot',
  'cfb_field_ptr',
  'cfb_field_len',
  'cfb_value',
  'cfb_sector_count',
  'cfb_raw_ptr',
  'cfb_raw_len',
  'hwp5_text_read',
  'hwp5_text_ptr',
  'hwp5_text_len',
  'hwp5_text_free',
]);

// Optional HWPX creation-profile query; ABI6 required exports remain unchanged.
export const HWPX_CHART_CREATE_PROFILE_FUNCTIONS = Object.freeze([
  'hwpx_edit_chart_create_profile_version',
  'hwpx_edit_inline_object_placement_version',
  'hwpx_edit_inline_object_owner',
]);

// Optional explicit HWP5 authoring profile. ABI6 required exports are unchanged.
export const HWP5_CHART_CREATE_ABI = Object.freeze({
  hwp5_edit_chart_create_profile_version: Object.freeze({
    params: Object.freeze([]),
    results: Object.freeze(['i32']),
  }),
  hwp5_edit_chart_create_preview: Object.freeze({
    params: Object.freeze(['i32', 'i32', 'i32', 'i32']),
    results: Object.freeze(['i32']),
  }),
  hwp5_edit_create_chart_current: Object.freeze({
    params: Object.freeze(['i32', 'i32', 'i32', 'i32', 'i32', 'i32']),
    results: Object.freeze(['i32']),
  }),
});
export const HWP5_CHART_CREATE_FUNCTIONS = Object.freeze(Object.keys(HWP5_CHART_CREATE_ABI));

// Optional HWP5 fixed-shape literal editor. Does not enable a qualified artifact.
export const HWP5_CHART_LITERAL_EDIT_PROFILE_VERSION = 1;
export const HWP5_CHART_LITERAL_EDIT_ABI = Object.freeze({
  hwp5_edit_chart_literal_edit_profile_version: Object.freeze({
    params: Object.freeze([]),
    results: Object.freeze(['i32']),
  }),
  hwp5_edit_chart_literal_edit_lease: Object.freeze({
    params: Object.freeze(['i32', 'i32']),
    results: Object.freeze(['i32']),
  }),
  hwp5_edit_chart_literal_edit_preview: Object.freeze({
    params: Object.freeze(['i32', 'i32']),
    results: Object.freeze(['i32']),
  }),
  hwp5_edit_chart_literal_edit_commit: Object.freeze({
    params: Object.freeze(['i32', 'i32', 'i32', 'i32']),
    results: Object.freeze(['i32']),
  }),
});
export const HWP5_CHART_LITERAL_EDIT_FUNCTIONS = Object.freeze(
  Object.keys(HWP5_CHART_LITERAL_EDIT_ABI),
);

export const LIVE_IMAGE_INSERT_ABI = Object.freeze({
  hwp5_edit_image_insert_version: { params: [], results: ['i32'] },
  hwp5_edit_insert_image_current: {
    params: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32'],
    results: ['i32'],
  },
  hwpx_edit_image_insert_version: { params: [], results: ['i32'] },
  hwpx_edit_insert_image: { params: ['i32', 'i32', 'i32', 'i32'], results: ['i32'] },
});

// Optional current-picture resource replacement; required ABI6 stays unchanged.
export const LIVE_PICTURE_REPLACEMENT_ABI = Object.freeze({
  hwp5_edit_picture_replace_version: { params: [], results: ['i32'] },
  hwp5_edit_picture_replace_owner: { params: ['i32', 'i32'], results: ['i32'] },
  hwp5_edit_replace_picture: { params: ['i32', 'i32', 'i32', 'i32'], results: ['i32'] },
  hwpx_edit_picture_replace_version: { params: [], results: ['i32'] },
  hwpx_edit_picture_replace_owner: { params: ['i32', 'i32'], results: ['i32'] },
  hwpx_edit_replace_picture: { params: ['i32', 'i32', 'i32', 'i32'], results: ['i32'] },
});

// Optional generated-cell properties. Existing ABI6 signatures remain unchanged.
export const CREATED_CELL_PROPERTIES_ABI = Object.freeze(
  Object.fromEntries(
    ['hwp5_edit', 'hwpx_edit'].flatMap((prefix) => [
      [`${prefix}_created_cell_properties_version`, { params: [], results: ['i32'] }],
      [`${prefix}_created_cell_properties_ticket`, { params: [], results: ['i32'] }],
      [`${prefix}_created_cell_properties_projection`, { params: [], results: ['i32'] }],
      [`${prefix}_set_created_cell_properties`, { params: ['i32', 'i32'], results: ['i32'] }],
    ]),
  ),
);
