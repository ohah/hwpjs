//! Direct edits to native generated-cell values, never a save/reparse cache.
const std = @import("std");
const model = @import("../../model/document.zig");
const Values = @import("created_table_values.zig").Values;
const records = @import("created_table_records.zig");
pub const Point = struct { section: usize, table: u64, row: u32, column: u32 };
pub const Edit = struct { point: Point, utf8: []const u8 };

fn tableIndex(pending: []const Values, point: Point) !usize {
    if (point.section >= pending.len) return error.InvalidSection;
    var found: ?usize = null;
    for (pending[point.section].entries, 0..) |entry, index| if (entry.value.table.identity == point.table) {
        if (found != null) return error.InvalidCreatedTableIdentity;
        found = index;
    };
    return found orelse error.InvalidCreatedTableIdentity;
}

pub fn copyUtf8(a: std.mem.Allocator, pending: []const Values, point: Point) ![]u8 {
    const index = try tableIndex(pending, point);
    const table = &pending[point.section].entries[index].value.table;
    _ = try table.plan.cell(point.row, point.column);
    const cell = try std.math.add(usize, try std.math.mul(usize, point.row, table.plan.columns), point.column);
    if (cell >= table.cells.len) return error.InvalidTableCell;
    return a.dupe(u8, table.cells[cell].text);
}

pub fn apply(a: std.mem.Allocator, sources: []const []const u8, document: *const model.Document, pending: []Values, version: @import("../version.zig").Version, edit: Edit, resources: records.Resources, limits: records.Limits) !void {
    if (sources.len != document.sections.len or pending.len != sources.len) return error.SourceBindingMismatch;
    const index = try tableIndex(pending, edit.point);
    var candidate = try pending[edit.point.section].clone(a, limits.max_bytes);
    defer candidate.deinit(a);
    const changed = try candidate.entries[index].value.table.replaceText(a, edit.point.row, edit.point.column, edit.utf8, limits.max_bytes);
    if (!changed) return;
    _ = try candidate.byteSize(limits.max_bytes);
    const output = try @import("created_table_section.zig").write(a, sources[edit.point.section], document.sections[edit.point.section], &candidate, version, resources, limits);
    defer a.free(output);
    std.mem.swap(Values, &pending[edit.point.section], &candidate);
}
