//! HTX1 uses explicit scalar fields and optional size flags.
const std = @import("std");
const Binding = @import("../hwpx/table_display_bindings.zig").Binding;
pub fn encode(a: std.mem.Allocator, bindings: []const Binding) ![]u8 {
    if (bindings.len > 100000) return error.LimitExceeded;
    const bytes = try a.alloc(u8, 8 + bindings.len * 48);
    errdefer a.free(bytes);
    @memcpy(bytes[0..4], "HTX1");
    std.mem.writeInt(u32, bytes[4..8], @intCast(bindings.len), .little);
    for (bindings, 0..) |binding, index| {
        const owner = binding.owner;
        const cell = owner.cell;
        const flags: u32 = @as(u32, @intFromBool(cell.width != null)) | (@as(u32, @intFromBool(cell.height != null)) << 1);
        const values = [_]usize{ binding.paragraph, owner.table_node, owner.list_node, owner.rows, owner.columns, cell.row orelse return error.MissingCellDisplayCoordinates, cell.column orelse return error.MissingCellDisplayCoordinates, cell.row_span orelse return error.MissingCellDisplaySpan, cell.column_span orelse return error.MissingCellDisplaySpan, cell.width orelse 0, cell.height orelse 0, flags };
        for (values, 0..) |value, column| {
            const at = 8 + index * 48 + column * 4;
            std.mem.writeInt(u32, bytes[at..][0..4], std.math.cast(u32, value) orelse return error.LimitExceeded, .little);
        }
    }
    return bytes;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const binding: Binding = .{ .paragraph = 2, .owner = .{ .table_node = 4, .cell_node = 5, .list_node = 6, .rows = 1, .columns = 1, .cell = .{ .row = 0, .column = 0, .row_span = 1, .column_span = 1, .width = 0, .height = null, .sub_list = 6 } } };
    const bytes = try encode(a, &.{binding});
    defer a.free(bytes);
    try std.testing.expectEqual(@as(usize, 56), bytes.len);
    try std.testing.expectEqualSlices(u8, "HTX1", bytes[0..4]);
    try std.testing.expectEqual(@as(u32, 1), std.mem.readInt(u32, bytes[52..56], .little));
}
test "HWPX table binding wire preserves absent size and zero with full allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
