//! Sparse border scalars and fill variants join by owner before one Native planner pass.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const p = @import("../model/border_fill_patch.zig");
const fill_wire = @import("cell_fill_batch.zig");
pub const max_cells = @import("../model/cell_edit_budget.zig").max_cells;
pub const border_stride = 32;
const Key = struct { section: usize, list: u32 };
pub fn Request(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/h5cell_style_batch.zig").Request else @import("../hwpx/hxcell_style_batch.zig").Request;
}
pub fn buildBorders(comptime format: Format, a: std.mem.Allocator, bytes: []const u8) ![]Request(format) {
    if (bytes.len % border_stride != 0) return error.InvalidCellBorderPatchBatch;
    if (bytes.len / border_stride > max_cells) return error.LimitExceeded;
    const rows = try a.alloc(Request(format), bytes.len / border_stride);
    errdefer a.free(rows);
    var seen = std.AutoHashMap(Key, void).init(a);
    defer seen.deinit();
    for (rows, 0..) |*out, index| {
        const row = bytes[index * border_stride ..][0..border_stride];
        var fields: [8]u32 = undefined;
        for (&fields, 0..) |*field, position| field.* = std.mem.readInt(u32, row[position * 4 ..][0..4], .little);
        const mask = fields[4];
        if (mask == 0 or mask > 7 or (mask & 1 == 0 and fields[5] != 0) or (mask & 2 == 0 and fields[6] != 0) or (mask & 4 == 0 and fields[7] != 0)) return error.InvalidCellBorderPatch;
        const normalized = try @import("cell_border.zig").parse(fields[3], fields[5], if (mask & 2 != 0) fields[6] else p.widths[0], fields[7]);
        const slot = try seen.getOrPut(.{ .section = fields[0], .list = fields[2] });
        if (slot.found_existing) return error.DuplicateCellBorderEdit;
        const edge: p.Edge = .{ .style = if (mask & 1 != 0) normalized.style else null, .width_hundredth_mm = if (mask & 2 != 0) normalized.width else null, .color = if (mask & 4 != 0) normalized.color else null };
        var patch: p.Patch = .{};
        for (&patch.border.edges, 0..) |*value, bit| if (normalized.edges & (@as(u8, 1) << @intCast(bit)) != 0) {
            value.* = edge;
        };
        out.* = .{ .section = fields[0], .table_node = fields[1], .list_node = fields[2], .patch = patch };
    }
    return rows;
}
pub fn build(comptime format: Format, a: std.mem.Allocator, border_bytes: []const u8, fill_bytes: []const u8) ![]Request(format) {
    const borders = try buildBorders(format, a, border_bytes);
    defer a.free(borders);
    const fills = try fill_wire.build(format, a, fill_bytes);
    defer a.free(fills);
    var rows: std.ArrayList(Request(format)) = .empty;
    defer rows.deinit(a);
    try rows.appendSlice(a, borders);
    var positions = std.AutoHashMap(Key, usize).init(a);
    defer positions.deinit();
    for (borders, 0..) |row, index| try positions.put(.{ .section = row.section, .list = row.list_node }, index);
    for (fills) |row| {
        const slot = try positions.getOrPut(.{ .section = row.section, .list = row.list_node });
        if (slot.found_existing) {
            const existing = &rows.items[slot.value_ptr.*];
            if (existing.table_node != row.table_node) return error.AmbiguousCellStyleOwner;
            existing.patch = p.merge(existing.patch, .{ .background = row.fill });
        } else {
            if (rows.items.len >= max_cells) return error.LimitExceeded;
            slot.value_ptr.* = rows.items.len;
            try rows.append(a, .{ .section = row.section, .table_node = row.table_node, .list_node = row.list_node, .patch = .{ .background = row.fill } });
        }
    }
    return rows.toOwnedSlice(a);
}
