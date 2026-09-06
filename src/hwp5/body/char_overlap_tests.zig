const std = @import("std");
const t = std.testing;
const P = @import("char_overlap.zig").Properties;
test "overlap preserves UTF16 signed size and opaque tail" {
    const raw = [_]u8{ 2, 0, 0, 0xd8, 0, 0, 255, 128, 255, 2, 0, 0, 0, 0, 255, 255, 255, 255, 9 };
    const p = try P.parse(&raw, .full);
    try t.expectEqualSlices(u8, raw[2..6], p.text);
    try t.expectEqual(-128, p.attributes.?.inner_size);
    try t.expectEqual(255, p.attributes.?.border);
    try t.expectEqual(255, p.attributes.?.expansion);
    try t.expectEqual(0xffffffff, p.attributes.?.shapes.get(1).?.id);
    try t.expect(p.attributes.?.shapes.get(2) == null);
    try t.expectEqualSlices(u8, &.{9}, p.extra);
    for (0..18) |n| try t.expectError(error.UnexpectedEnd, P.parse(raw[0..n], .full));
    const old = try P.parse(&raw, .text_only);
    try t.expect(old.attributes == null);
    try t.expectEqualSlices(u8, raw[6..], old.extra);
    try t.expectError(error.UnexpectedEnd, P.parse(raw[0..6], .full));
}
fn allocationCase(a: std.mem.Allocator, bad: bool) !void {
    var raw = [_]u8{0} ** 18;
    std.mem.writeInt(u32, raw[0..4], 71 | (14 << 20), .little);
    std.mem.writeInt(u32, raw[4..8], @import("control_rules.zig").id("tcps"), .little);
    raw[13] = 1;
    std.mem.writeInt(u32, raw[14..18], if (bad) 1 else 0xffffffff, .little);
    var tree = try @import("tree.zig").Tree.parse(a, &raw, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    const result = @import("char_overlap_validation.zig").inspect(tree, .full, 1);
    if (bad) try t.expectError(error.InvalidResourceReference, result) else try t.expectEqual(1, (try result).inherited_refs);
}
test "overlap inherited reference and invalid reference allocation cleanup" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{false});
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{true});
}
