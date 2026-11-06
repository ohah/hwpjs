//! Sparse basic diagonal requests. Old four-edge wire remains unchanged.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const p = @import("../model/border_fill_patch.zig");
pub const max_cells = @import("../model/cell_edit_budget.zig").max_cells;
pub const stride = 48;
pub fn Request(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/h5cell_style_batch.zig").Request else @import("../hwpx/hxcell_style_batch.zig").Request;
}
pub fn build(comptime format: Format, a: std.mem.Allocator, bytes: []const u8) ![]Request(format) {
    if (bytes.len % stride != 0) return error.InvalidCellDiagonalBatch;
    if (bytes.len / stride > max_cells) return error.LimitExceeded;
    const rows = try a.alloc(Request(format), bytes.len / stride);
    errdefer a.free(rows);
    var seen = std.AutoHashMap(u64, void).init(a);
    defer seen.deinit();
    for (rows, 0..) |*out, index| {
        const row = bytes[index * stride ..][0..stride];
        var fields: [12]u32 = undefined;
        for (&fields, 0..) |*field, word| field.* = std.mem.readInt(u32, row[word * 4 ..][0..4], .little);
        const mask = fields[3];
        if (mask == 0 or mask > 15) return error.InvalidCellDiagonal;
        for (fields[8..]) |reserved| if (reserved != 0) return error.InvalidCellDiagonal;
        for (fields[4..8], 0..) |value, bit| if (mask & (@as(u32, 1) << @intCast(bit)) == 0 and value != 0) return error.InvalidCellDiagonal;
        if (fields[4] > 3) return error.InvalidCellDiagonal;
        const normalized = try @import("cell_border.zig").parse(1, fields[5], if (mask & 4 != 0) fields[6] else p.widths[0], fields[7]);
        const diagonal: p.DiagonalPatch = .{
            .directions = if (mask & 1 != 0) @fromBackingInt(@as(u2, @intCast(fields[4]))) else null,
            .stroke = .{
                .style = if (mask & 2 != 0) normalized.style else null,
                .width_hundredth_mm = if (mask & 4 != 0) normalized.width else null,
                .color = if (mask & 8 != 0) normalized.color else null,
            },
        };
        const patch: p.Patch = .{ .diagonal = diagonal };
        try p.validate(patch);
        const slot = try seen.getOrPut(@as(u64, fields[0]) << 32 | fields[2]);
        if (slot.found_existing) return error.DuplicateCellDiagonalEdit;
        out.* = .{ .section = fields[0], .table_node = fields[1], .list_node = fields[2], .patch = patch };
    }
    return rows;
}
