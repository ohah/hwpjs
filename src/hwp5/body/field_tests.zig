const std = @import("std");
const t = std.testing;
const field = @import("field_start.zig");
test "field attributes have independent raw bit views" {
    var raw = [_]u8{0} ** 11;
    for (0..32) |bit| {
        const flags = @as(u32, 1) << @intCast(bit);
        std.mem.writeInt(u32, raw[0..4], flags, .little);
        const p = try field.Properties.parse(&raw);
        try t.expectEqual(flags & 1 != 0, p.editableReadOnly());
        try t.expectEqual((flags >> 11) & 15, p.updateKind());
        try t.expectEqual(flags & 0x8000 != 0, p.modified());
        try t.expectEqual(flags & ~@as(u32, 0xf801), p.unknownBits());
    }
    const rules = @import("control_rules.zig");
    for (rules.rules) |rule| try t.expectEqual(rule.code == 3, field.supports(rule.control_id));
    try t.expect(!field.supports(rules.id("%zzz")));
    try t.expect(!field.supports(rules.id("%%%%")));
}
fn allocationCase(a: std.mem.Allocator, bad: bool) !void {
    var raw = [_]u8{0} ** 19;
    std.mem.writeInt(u32, raw[0..4], 71 | ((if (bad) @as(u32, 14) else 15) << 20), .little);
    std.mem.writeInt(u32, raw[4..8], @import("control_rules.zig").id("%hlk"), .little);
    var tree = try @import("tree.zig").Tree.parse(a, raw[0..if (bad) 18 else 19], .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = @import("field_validation.zig").inspect(tree);
    if (bad) try t.expectError(error.UnexpectedEnd, result) else try t.expectEqual(1, (try result).controls);
}
test "field validation allocation cleanup on valid and missing instance ID" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{false});
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{true});
}
