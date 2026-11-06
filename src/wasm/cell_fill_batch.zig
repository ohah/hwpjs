//! Fixed-width owned fill requests. Source bindings and publication stay in format sessions.
const std = @import("std");
const p = @import("../model/border_fill_patch.zig");
const Format = @import("../model/document.zig").Format;
pub const max_cells = @import("../model/cell_edit_budget.zig").max_cells;
pub const stride = 48;
pub fn Request(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/h5cell_fill_batch.zig").Request else @import("../hwpx/hxcell_fill_batch.zig").Request;
}
pub fn build(comptime format: Format, a: std.mem.Allocator, bytes: []const u8) ![]Request(format) {
    if (bytes.len % stride != 0) return error.InvalidCellFillBatch;
    if (bytes.len / stride > max_cells) return error.LimitExceeded;
    const values = try a.alloc(Request(format), bytes.len / stride);
    errdefer a.free(values);
    var seen: std.AutoHashMap(u64, void) = .init(a);
    defer seen.deinit();
    for (values, 0..) |*value, index| {
        const row = bytes[index * stride ..][0..stride];
        var fields: [12]u32 = undefined;
        for (&fields, 0..) |*field, offset| field.* = std.mem.readInt(u32, row[offset * 4 ..][0..4], .little);
        const fill = try parse(fields[3], fields[4..12]);
        const slot = try seen.getOrPut(@as(u64, fields[0]) << 32 | fields[2]);
        if (slot.found_existing) return error.DuplicateCellFillEdit;
        value.* = .{ .section = fields[0], .table_node = fields[1], .list_node = fields[2], .fill = fill };
    }
    return values;
}
pub fn parse(kind: u32, raw: *const [8]u32) !p.Background {
    const used: usize = switch (kind) {
        0 => 0,
        1 => 1,
        2 => 3,
        3 => 7,
        else => return error.InvalidCellFill,
    };
    for (raw[used..]) |value| if (value != 0) return error.InvalidCellFill;
    const fill: p.Background = switch (kind) {
        0 => .none,
        1 => .{ .solid = .{ .color = raw[0] } },
        2 => blk: {
            if (raw[2] >= 6) return error.InvalidCellFill;
            break :blk .{ .hatch = .{ .face = raw[0], .hatch = raw[1], .style = @fromBackingInt(@as(u3, @intCast(raw[2]))) } };
        },
        3 => blk: {
            if (raw[2] >= 360 or raw[3] > 100 or raw[4] > 100 or raw[5] > 100 or raw[6] > 100) return error.InvalidCellFill;
            break :blk .{ .linear = .{ .colors = .{ raw[0], raw[1] }, .angle = @intCast(raw[2]), .center_x = @intCast(raw[3]), .center_y = @intCast(raw[4]), .step = @intCast(raw[5]), .step_center = @intCast(raw[6]) } };
        },
        else => unreachable,
    };
    try p.validate(.{ .background = fill });
    return fill;
}
