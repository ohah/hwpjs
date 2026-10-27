const std = @import("std");
const Value = struct { allocator: std.mem.Allocator, bytes: []u8 };
fn dispose(value: *Value) void {
    value.allocator.free(value.bytes);
}
const E = @import("history_state_entry.zig").Entry(Value, dispose);
fn trial(a: std.mem.Allocator) !void {
    const entry = try E.create(a, @sizeOf(E) + 16, null);
    defer entry.deinit();
    const allocator = entry.snapshotAllocator();
    const bytes = try allocator.alloc(u8, 16);
    entry.finish(.{ .allocator = allocator, .bytes = bytes }, 16);
    try std.testing.expectEqual(@as(usize, 16), entry.meter.live);
    try std.testing.expectEqual(@sizeOf(E) + 16, entry.ownedBytes());
}
test "SSOT full allocator: snapshot owned bytes are direct requests without arena reserve" {
    try trial(std.testing.allocator);
}
test "SSOT full allocator: every tiny allocation failure frees partial snapshot and entry" {
    try @import("../testing/allocation_failures.zig").check(trial, .{});
}
