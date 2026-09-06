const std = @import("std");
const t = std.testing;
const validation = @import("arc_validation.zig");
fn check(a: std.mem.Allocator, layout: ?@import("shape_arc.zig").Layout, scenario: u8) !void {
    var raw = [_]u8{0} ** 72;
    std.mem.writeInt(u32, raw[0..4], 76 | (4 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], 0x24617263, .little);
    std.mem.writeInt(u32, raw[8..12], 81 | (1 << 10) | (28 << 20), .little);
    @memcpy(raw[40..72], raw[8..40]);
    var bytes: []const u8 = raw[0..40];
    if (scenario == 1) bytes = raw[0..8];
    if (scenario == 2) bytes = &raw;
    if (scenario == 3) {
        std.mem.writeInt(u32, raw[8..12], 81 | (28 << 20), .little);
        bytes = raw[8..40];
    }
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = validation.inspect(tree, layout);
    switch (scenario) {
        0 => try t.expectEqualDeep(if (layout) |selected|
            validation.Report{ .arcs = 1, .parsed = 1, .extra_bytes = if (selected == .reference_u8) 3 else 0 }
        else
            validation.Report{ .arcs = 1, .unselected = 1, .unselected_bytes = 28 }, try result),
        1 => try t.expectError(error.MissingArc, result),
        2 => try t.expectError(error.DuplicateArc, result),
        3 => try t.expectError(error.OrphanArc, result),
        else => unreachable,
    }
}
test "arc ownership and selected or unselected payload cleanup under allocation failures" {
    for ([_]?@import("shape_arc.zig").Layout{ null, .specified_u32, .reference_u8 }) |layout| {
        for (0..4) |scenario| try t.checkAllAllocationFailures(t.allocator, check, .{ layout, @as(u8, @intCast(scenario)) });
    }
}
