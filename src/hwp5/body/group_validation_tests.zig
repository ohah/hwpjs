const std = @import("std");
const t = std.testing;
fn check(a: std.mem.Allocator, scenario: u8) !void {
    var b = [_]u8{0} ** 218;
    std.mem.writeInt(u32, b[0..4], 71 | (4 << 20), .little);
    std.mem.writeInt(u32, b[4..8], 0x67736f20, .little);
    std.mem.writeInt(u32, b[8..12], 76 | (1 << 10) | (106 << 20), .little);
    std.mem.writeInt(u32, b[12..16], 0x24636f6e, .little);
    std.mem.writeInt(u32, b[16..20], 0x24636f6e, .little);
    std.mem.writeInt(u16, b[112..114], 1, .little);
    std.mem.writeInt(u32, b[114..118], 0x24726563, .little);
    std.mem.writeInt(u32, b[118..122], 76 | (2 << 10) | (96 << 20), .little);
    std.mem.writeInt(u32, b[122..126], 0x24726563, .little);
    var bytes: []const u8 = &b;
    if (scenario == 1) std.mem.writeInt(u32, b[114..118], 0x246c696e, .little);
    if (scenario == 2) b[112] = 0;
    if (scenario == 3) bytes = b[0..118];
    if (scenario == 4) {
        std.mem.writeInt(u32, b[8..12], 76 | (1 << 10) | (100 << 20), .little);
        bytes = b[0..112];
    }
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = @import("shape_validation.zig").inspectDetailed(tree, null, 0);
    switch (scenario) {
        0 => try t.expectEqualDeep(@import("group_validation.zig").Report{ .groups = 1, .children = 1 }, (try result).groups),
        1 => try t.expectError(error.GroupChildIdentityMismatch, result),
        2, 3 => try t.expectError(error.GroupChildCountMismatch, result),
        4 => try t.expectError(error.UnexpectedEnd, result),
        else => unreachable,
    }
}
test "group list ownership failures release every tree allocation" {
    for (0..5) |scenario| try t.checkAllAllocationFailures(t.allocator, check, .{@as(u8, @intCast(scenario))});
}
