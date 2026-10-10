//! HTP1 scalar placement rows; parent existence is explicit.
const std = @import("std");
const Placement = @import("../hwpx/table_display_placements.zig").Placement;
pub fn encode(a: std.mem.Allocator, rows: []const Placement) ![]u8 {
    return encodeRows(a, rows, "HTP2");
}
pub fn encodeHwp5(a: std.mem.Allocator, rows: []const @import("../hwp5/edit/table_display_placements.zig").Placement) ![]u8 {
    return encodeRows(a, rows, "HTP5");
}
fn encodeRows(a: std.mem.Allocator, rows: anytype, magic: *const [4]u8) ![]u8 {
    const has_anchor = @hasField(std.meta.Child(@TypeOf(rows)), "anchor_unit");
    const stride: usize = if (has_anchor) 28 else 20;
    if (rows.len > 100000) return error.LimitExceeded;
    const bytes = try a.alloc(u8, 8 + rows.len * stride);
    errdefer a.free(bytes);
    @memcpy(bytes[0..4], magic);
    std.mem.writeInt(u32, bytes[4..8], @intCast(rows.len), .little);
    for (rows, 0..) |row, index| {
        if ((row.parent_table_node == null) != (row.parent_list_node == null)) return error.InvalidTablePlacement;
        const values = [_]usize{ row.table_node, row.paragraph, row.parent_table_node orelse 0, row.parent_list_node orelse 0, @intFromBool(row.parent_table_node != null) };
        for (values, 0..) |value, column| {
            const at = 8 + index * stride + column * 4;
            std.mem.writeInt(u32, bytes[at..][0..4], std.math.cast(u32, value) orelse return error.LimitExceeded, .little);
        }
        if (has_anchor) {
            const at = 8 + index * stride;
            std.mem.writeInt(u32, bytes[at + 20 ..][0..4], std.math.cast(u32, row.anchor_unit orelse 0) orelse return error.LimitExceeded, .little);
            std.mem.writeInt(u32, bytes[at + 24 ..][0..4], @intFromBool(row.anchor_unit != null), .little);
        }
    }
    return bytes;
}
test "HWPX placement wire preserves parent absence and rejects half bindings with allocation failures" {
    const a = std.testing.allocator;
    const rows = [_]Placement{.{ .table_node = 4, .paragraph = 1, .parent_table_node = null, .parent_list_node = null }};
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const Placement) !void {
            const bytes = try encode(allocator, source);
            defer allocator.free(bytes);
            try std.testing.expectEqualSlices(u8, "HTP2", bytes[0..4]);
            try std.testing.expectEqual(@as(usize, 36), bytes.len);
            try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, bytes[24..28], .little));
        }
    }.run, .{&rows});
    var invalid = rows[0];
    invalid.parent_list_node = 3;
    try std.testing.expectError(error.InvalidTablePlacement, encode(a, &.{invalid}));
}

test "HWP5 placement wire preserves zero based host with allocation failures" {
    const rows = [_]@import("../hwp5/edit/table_display_placements.zig").Placement{.{ .table_node = 4, .paragraph = 0, .parent_table_node = null, .parent_list_node = null }};
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, source: []const @import("../hwp5/edit/table_display_placements.zig").Placement) !void {
            const bytes = try encodeHwp5(a, source);
            defer a.free(bytes);
            try std.testing.expectEqualSlices(u8, "HTP5", bytes[0..4]);
            try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, bytes[12..16], .little));
        }
    }.run, .{&rows});
}
