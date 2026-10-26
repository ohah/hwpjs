//! Atomic native staging; current paragraph/cell projection is a later layer.
const std = @import("std");
const model = @import("../../model/document.zig");
const values = @import("created_table_values.zig");
const records = @import("created_table_records.zig");
pub const Edit = struct {
    section: usize,
    paragraph: usize,
    unit: u32,
    table: *const @import("../../model/created_table.zig").Table,
    options: records.Options,
};

pub fn apply(a: std.mem.Allocator, sources: []const []const u8, document: *const model.Document, pending: []values.Values, version: @import("../version.zig").Version, edit: Edit, resources: records.Resources, limits: records.Limits) !void {
    if (edit.section >= document.sections.len or pending.len != document.sections.len or sources.len != document.sections.len) return error.InvalidSection;
    const section = &document.sections[edit.section];
    const anchor = try @import("created_table_anchor.zig").capture(a, section, edit.paragraph, edit.unit);
    try @import("created_table_ids.zig").validate(a, sources, version, document, pending, edit.table, 2_000_000);
    var value = try @import("created_table_value.zig").Value.initClone(a, edit.table, edit.options, limits.max_bytes);
    defer value.deinit(a);
    var candidate = try pending[edit.section].clone(a, limits.max_bytes);
    defer candidate.deinit(a);
    try candidate.append(a, anchor, &value, limits.max_cells, limits.max_bytes);
    const output = try @import("created_table_section.zig").write(a, sources[edit.section], section.*, &candidate, version, resources, limits);
    defer a.free(output);
    std.mem.swap(values.Values, &pending[edit.section], &candidate);
}
