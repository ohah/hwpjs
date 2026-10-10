//! HTB1 scalar table bindings, not native struct memory or layout pixels.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, bindings: []const @import("../hwp5/edit/table_display_bindings.zig").Binding) ![]u8 {
    const count = std.math.cast(u32, bindings.len) orelse return error.LimitExceeded;
    const rows = std.math.mul(usize, bindings.len, 44) catch return error.LimitExceeded;
    const bytes = try a.alloc(u8, std.math.add(usize, rows, 8) catch return error.LimitExceeded);
    @memcpy(bytes[0..4], "HTB1");
    std.mem.writeInt(u32, bytes[4..8], count, .little);
    for (bindings, 0..) |binding, index| {
        inline for (.{ "paragraph", "table_node", "list_node", "rows", "columns", "row", "column", "row_span", "column_span", "width", "height" }, 0..) |field, column| {
            const at = 8 + index * 44 + column * 4;
            std.mem.writeInt(u32, bytes[at..][0..4], @field(binding, field), .little);
        }
    }
    return bytes;
}
fn allocationCase(a: std.mem.Allocator) !void {
    const bindings = [_]@import("../hwp5/edit/table_display_bindings.zig").Binding{.{ .paragraph = 7, .table_node = 9, .list_node = 10, .rows = 1, .columns = 1, .row = 0, .column = 0, .row_span = 1, .column_span = 1, .width = 0xffff_ffff, .height = 0 }};
    const bytes = try encode(a, &bindings);
    defer a.free(bytes);
    try std.testing.expectEqual(@as(usize, 52), bytes.len);
    try std.testing.expectEqualSlices(u8, "HTB1", bytes[0..4]);
    try std.testing.expectEqual(@as(u32, 7), std.mem.readInt(u32, bytes[8..12], .little));
    try std.testing.expectEqual(@as(u32, 0xffff_ffff), std.mem.readInt(u32, bytes[44..48], .little));
}
test "HWP5 table binding wire explicit fields and allocation failure" {
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
