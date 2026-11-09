//! Independent fixed ABI action and identity boundary contracts.
const std = @import("std");
const request = @import("wasm/created_table_grid_request.zig");
const grid = @import("model/created_table_grid.zig");
test "created table grid wire decodes four fixed actions and refuses unknown codes" {
    const expected = [_]grid.Command{ .{ .insert_row = 7 }, .{ .delete_row = 7 }, .{ .insert_column = 7 }, .{ .delete_column = 7 } };
    for (expected, 0..) |value, code| try std.testing.expectEqualDeep(value, try request.decode(@intCast(code), 7));
    for ([_]u32{ 4, 255, 0x80000000, std.math.maxInt(u32) }) |code| try std.testing.expectError(error.InvalidCreatedTableGridAction, request.decode(code, 0));
}
test "created table grid wire preserves unsigned 64 bit identities without zero aliases" {
    try std.testing.expectError(error.InvalidCreatedTableIdentity, request.identity(0, 0));
    try std.testing.expectEqual(@as(u64, 1), try request.identity(1, 0));
    try std.testing.expectEqual(@as(u64, 0x8000000000000000), try request.identity(0, 0x80000000));
    try std.testing.expectEqual(std.math.maxInt(u64), try request.identity(std.math.maxInt(u32), std.math.maxInt(u32)));
}
