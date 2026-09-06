const std = @import("std");
const t = std.testing;
const validation = @import("ellipse_validation.zig");
fn allocationCase(a: std.mem.Allocator, scenario: u8) !void {
    var raw = [_]u8{0} ** 136;
    std.mem.writeInt(u32, raw[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], 0x24656c6c, .little);
    std.mem.writeInt(u32, raw[8..12], 80 | (1 << 10) | (60 << 20), .little);
    std.mem.writeInt(u32, raw[12..16], 0x80000003, .little);
    @memcpy(raw[72..136], raw[8..72]);
    var bytes: []const u8 = raw[0..72];
    if (scenario == 1) bytes = raw[0..8];
    if (scenario == 2) bytes = &raw;
    if (scenario == 3) {
        std.mem.writeInt(u32, raw[8..12], 80 | (60 << 20), .little);
        bytes = raw[8..72];
    }
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = validation.inspect(tree);
    switch (scenario) {
        0 => try t.expectEqualDeep(validation.Report{ .ellipses = 1, .arcs = 1, .interval_updates = 1, .unknown_attributes = 1 }, try result),
        1 => try t.expectError(error.MissingEllipse, result),
        2 => try t.expectError(error.DuplicateEllipse, result),
        3 => try t.expectError(error.OrphanEllipse, result),
        else => unreachable,
    }
}
test "ellipse owner cleanup and independent flags survive allocation failures" {
    for (0..4) |scenario| try t.checkAllAllocationFailures(t.allocator, allocationCase, .{@as(u8, @intCast(scenario))});
}
