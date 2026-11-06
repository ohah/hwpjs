//! Decode one atomic Native batch. Format sessions own grouped preflight and publication.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
pub const max_cells = @import("../model/cell_edit_budget.zig").max_cells;
pub const stride = 28;
pub fn Request(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/cell_border_values.zig").Edit else @import("../hwpx/hxcell_border_batch.zig").Request;
}
pub fn build(comptime format: Format, a: std.mem.Allocator, bytes: []const u8) ![]Request(format) {
    if (bytes.len % stride != 0) return error.InvalidCellBorderBatch;
    if (bytes.len / stride > max_cells) return error.LimitExceeded;
    const values = try a.alloc(Request(format), bytes.len / stride);
    errdefer a.free(values);
    var seen: std.AutoHashMap(u64, void) = .init(a);
    defer seen.deinit();
    for (values, 0..) |*value, index| {
        const row = bytes[index * stride ..][0..stride];
        const section = std.mem.readInt(u32, row[0..4], .little);
        const table = std.mem.readInt(u32, row[4..8], .little);
        const list = std.mem.readInt(u32, row[8..12], .little);
        const border = try @import("cell_border.zig").parse(std.mem.readInt(u32, row[12..16], .little), std.mem.readInt(u32, row[16..20], .little), std.mem.readInt(u32, row[20..24], .little), std.mem.readInt(u32, row[24..28], .little));
        const entry = try seen.getOrPut(@as(u64, section) << 32 | list);
        if (entry.found_existing) return error.DuplicateCellBorderEdit;
        value.* = .{ .section = section, .table_node = table, .list_node = list, .edges = border.edges, .style = border.style, .width_hundredth_mm = border.width, .color = border.color };
    }
    return values;
}
