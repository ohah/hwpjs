// Generated from js/abi-schema.mjs by tools/generate-abi.mjs. Do not edit.
pub const version: u32 = 6;
pub const Field = enum(u32) {
    name = 0,
    path = 1,
    content = 2,
    clsid = 3,
    _,
};
pub const Value = enum(u32) {
    kind = 0,
    color = 1,
    left = 2,
    right = 3,
    child = 4,
    state = 5,
    created = 6,
    modified = 7,
    start = 8,
    size = 9,
    uses_fat = 10,
    has_content = 11,
    _,
};
pub const CreatedTableGridAction = enum(u32) {
    insert_row = 0,
    delete_row = 1,
    insert_column = 2,
    delete_column = 3,
    _,
};
pub const hwp5_document_text_read_exports = [_][]const u8{
    "hwp5_read_open",
    "hwp5_read_close",
    "hwp5_read_document_text_snapshot",
    "hwp5_read_document_text_anchor",
    "hwp5_read_document_text_selection",
    "hwp5_read_document_text_read_binding",
    "hwp5_read_output_ptr",
    "hwp5_read_output_len",
    "hwp5_read_output_free",
    "hwp5_read_error_ptr",
    "hwp5_read_error_len",
};
pub const hwpx_control_text_read_exports = [_][]const u8{
    "hwpx_edit_paragraph_control_text_snapshot",
    "hwpx_edit_paragraph_control_text_snapshot_current",
    "hwpx_edit_control_text_read_identity",
};
pub const hwp5_chart_create_exports = [_][]const u8{
    "hwp5_edit_chart_create_profile_version",
    "hwp5_edit_chart_create_preview",
    "hwp5_edit_create_chart_current",
};
pub const hwp5_chart_create_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwp5_edit_chart_create_profile_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_chart_create_preview", .params = &.{ "i32", "i32", "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_create_chart_current", .params = &.{ "i32", "i32", "i32", "i32", "i32", "i32" }, .results = &.{"i32"} },
};
pub const hwp5_chart_literal_edit_exports = [_][]const u8{
    "hwp5_edit_chart_literal_edit_profile_version",
    "hwp5_edit_chart_literal_edit_lease",
    "hwp5_edit_chart_literal_edit_preview",
    "hwp5_edit_chart_literal_edit_commit",
};
pub const hwp5_chart_literal_edit_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwp5_edit_chart_literal_edit_profile_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_chart_literal_edit_lease", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_chart_literal_edit_preview", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_chart_literal_edit_commit", .params = &.{ "i32", "i32", "i32", "i32" }, .results = &.{"i32"} },
};
pub const hwp5_chart_read_exports = [_][]const u8{
    "hwp5_edit_chart_display_profile_version",
    "hwp5_edit_chart_candidates",
    "hwp5_edit_chart_display",
};
pub const OptionalFunctionSignature = struct { name: []const u8, params: []const []const u8, results: []const []const u8 };
pub const hwp5_chart_read_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwp5_edit_chart_display_profile_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_chart_candidates", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_chart_display", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
};
pub const hwp5_text_transaction_exports = [_][]const u8{
    "hwp5_edit_text_transaction_capabilities",
    "hwp5_edit_query_text_transaction",
    "hwp5_edit_apply_text_transaction",
};
pub const hwpx_text_transaction_exports = [_][]const u8{
    "hwpx_edit_text_transaction_capabilities",
    "hwpx_edit_query_text_transaction",
    "hwpx_edit_apply_text_transaction",
};
pub const hwp5_named_fields_exports = [_][]const u8{
    "hwp5_edit_named_fields",
};
pub const hwpx_named_fields_exports = [_][]const u8{
    "hwpx_edit_named_fields",
};
pub const hwpx_named_field_rename_exports = [_][]const u8{
    "hwpx_edit_rename_named_field",
};
pub const hwpx_named_field_create_exports = [_][]const u8{
    "hwpx_edit_create_named_field",
};
pub const hwpx_named_field_parameters_exports = [_][]const u8{
    "hwpx_edit_named_field_parameters",
    "hwpx_edit_set_named_field_parameters",
};
pub const hwp5_source_table_cell_split_exports = [_][]const u8{
    "hwp5_edit_source_table_cell_split_capabilities",
    "hwp5_edit_split_source_table_cells",
};
pub const hwpx_chart_create_profile_exports = [_][]const u8{
    "hwpx_edit_chart_create_profile_version",
    "hwpx_edit_inline_object_placement_version",
    "hwpx_edit_inline_object_owner",
};
pub const live_image_insert_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwp5_edit_image_insert_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_insert_image_current", .params = &.{ "i32", "i32", "i32", "i32", "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_image_insert_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_insert_image", .params = &.{ "i32", "i32", "i32", "i32" }, .results = &.{"i32"} },
};
pub const created_cell_properties_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwp5_edit_created_cell_properties_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_created_cell_properties_ticket", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_created_cell_properties_projection", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_set_created_cell_properties", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_created_cell_properties_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_created_cell_properties_ticket", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_created_cell_properties_projection", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_set_created_cell_properties", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
};
pub const live_picture_replacement_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwp5_edit_picture_replace_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_picture_replace_owner", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_replace_picture", .params = &.{ "i32", "i32", "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_picture_replace_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_picture_replace_owner", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_replace_picture", .params = &.{ "i32", "i32", "i32", "i32" }, .results = &.{"i32"} },
};
pub const hwpx_object_body_flow_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwpx_edit_object_body_flow_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_object_body_flow", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_set_object_body_flow", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
};
pub const hwpx_object_outer_margins_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwpx_edit_object_outer_margins_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_object_outer_margins", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwpx_edit_set_object_outer_margins", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
};
pub const hwp5_object_outer_margins_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwp5_edit_object_outer_margins_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_object_outer_margins", .params = &.{ "i32", "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_set_object_outer_margins", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
};
pub const hwp5_vertical_outer_margins_signatures = [_]OptionalFunctionSignature{
    .{ .name = "hwp5_edit_vertical_outer_margins_version", .params = &.{}, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_vertical_outer_margins", .params = &.{ "i32", "i32", "i32" }, .results = &.{"i32"} },
    .{ .name = "hwp5_edit_set_vertical_outer_margins", .params = &.{ "i32", "i32" }, .results = &.{"i32"} },
};
pub const document = struct {
    pub const header_bytes: usize = 8;
    pub const node_bytes: usize = 56;
    pub const parent: usize = 0;
    pub const kind: usize = 4;
    pub const name_len: usize = 8;
    pub const content_len: usize = 12;
    pub const state: usize = 16;
    pub const reserved: usize = 20;
    pub const created: usize = 24;
    pub const modified: usize = 32;
    pub const clsid: usize = 40;
};
