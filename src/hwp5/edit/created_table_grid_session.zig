//! Native transaction for owned, generated, unmerged tables only.
const std = @import("std");
const model = @import("../../model/document.zig");
const grid = @import("../../model/created_table_grid.zig");
const Values = @import("created_table_values.zig").Values;
const records = @import("created_table_records.zig");
const ids = @import("created_table_ids.zig");
pub const Edit = struct { section: usize, table: u64, command: grid.Command };

/// Borrows source/model and publishes only after serialization admission.
/// Failed planning, cloning, editing or writing leaves all pending values intact.
pub fn apply(a: std.mem.Allocator, sources: []const []const u8, document: *const model.Document, pending: []Values, version: @import("../version.zig").Version, edit: Edit, resources: records.Resources, limits: records.Limits) !void {
    if (sources.len != document.sections.len or pending.len != sources.len) return error.SourceBindingMismatch;
    if (edit.section >= pending.len) return error.InvalidSection;
    var found: ?usize = null;
    for (pending, 0..) |tables, section| for (tables.entries, 0..) |entry, index| {
        if (entry.value.table.identity == edit.table) {
            if (found != null or section != edit.section or edit.table == 0) return error.InvalidCreatedTableIdentity;
            found = index;
        }
    };
    const index = found orelse return error.InvalidCreatedTableIdentity;
    const source = &pending[edit.section].entries[index].value.table;
    var planned: ?ids.Plan = null;
    defer if (planned) |*plan| plan.deinit(a);
    const count: usize = switch (edit.command) {
        .insert_row => source.plan.columns,
        .insert_column => source.plan.rows,
        .delete_row, .delete_column => 0,
    };
    if (count != 0) planned = try ids.plan(a, sources, version, document, pending, count, 2_000_000);
    var candidate = try pending[edit.section].clone(a, limits.max_bytes);
    defer candidate.deinit(a);
    const target = &candidate.entries[index].value.table;
    const replacement = try grid.edit(a, target, edit.command, if (planned) |plan| plan.paragraph_ids else &.{}, .{ .max_cells = limits.max_cells, .max_text_bytes = limits.max_bytes });
    target.deinit(a);
    target.* = replacement;
    _ = try candidate.byteSize(limits.max_bytes);
    const output = try @import("created_table_section.zig").write(a, sources[edit.section], document.sections[edit.section], &candidate, version, resources, limits);
    defer a.free(output);
    std.mem.swap(Values, &pending[edit.section], &candidate);
}
