const std = @import("std");
const t = std.testing;
const d = @import("reader.zig");
const State = @import("compatibility_owner.zig").State;
fn inspect(bytes: []const u8) !void {
    var it = try d.Iterator.init(bytes, .{ .raw = 0x05000107 }, .{});
    var state: State = .{};
    while (try it.next()) |r| try state.observe(r);
}
test "layout owner is a root group not merely an earlier compatible record" {
    var bytes = [_]u8{0} ** 36;
    std.mem.writeInt(u32, bytes[0..4], 30 | (4 << 20), .little);
    // Unknown nested record does not change the enclosing root.
    std.mem.writeInt(u32, bytes[8..12], 999 | (2 << 10), .little);
    std.mem.writeInt(u32, bytes[12..16], 31 | (1 << 10) | (20 << 20), .little);
    try inspect(&bytes);
    try t.expectError(error.InvalidCompatibilityOwner, inspect(bytes[12..]));
    // A new unknown root closes the compatible-document group.
    std.mem.writeInt(u32, bytes[8..12], 999, .little);
    try t.expectError(error.InvalidCompatibilityOwner, inspect(&bytes));
    // Unknown level-one siblings do not end it either.
    std.mem.writeInt(u32, bytes[8..12], 999 | (1 << 10), .little);
    try inspect(&bytes);
}
