const std = @import("std");
const t = std.testing;
fn allocationCase(a: std.mem.Allocator, scenario: u8) !void {
    var raw = [_]u8{0} ** 52;
    std.mem.writeInt(u32, raw[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], 0x246c696e, .little);
    std.mem.writeInt(u32, raw[8..12], 78 | (1 << 10) | (18 << 20), .little);
    std.mem.writeInt(u16, raw[28..30], 0x8000, .little);
    @memcpy(raw[30..52], raw[8..30]);
    var bytes: []const u8 = raw[0..30];
    if (scenario == 1) bytes = raw[0..8];
    if (scenario == 2) bytes = &raw;
    if (scenario == 3) {
        std.mem.writeInt(u32, raw[8..12], 78 | (18 << 20), .little);
        bytes = raw[8..30];
    }
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = @import("line_validation.zig").inspect(tree);
    switch (scenario) {
        0 => {
            const report = try result;
            try t.expectEqual(1, report.lines);
            try t.expectEqual(1, report.nonboolean_attributes);
        },
        1 => try t.expectError(error.MissingLine, result),
        2 => try t.expectError(error.DuplicateLine, result),
        3 => try t.expectError(error.OrphanLine, result),
        else => unreachable,
    }
}
test "line owner cleanup across missing duplicate orphan and allocation failures" {
    for (0..4) |scenario| try t.checkAllAllocationFailures(t.allocator, allocationCase, .{@as(u8, @intCast(scenario))});
}
