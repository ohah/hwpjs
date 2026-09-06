const std = @import("std");
const t = std.testing;
const identity = @import("control_identity.zig");
const id = @import("control_rules.zig").id;
const P = @import("field_start.zig").Properties;
const raw = [_]u8{ 1, 128, 0, 0, 255, 5, 0, 'M', 0, 'E', 0, 'M', 0, 'O', 0, '/', 0, 255, 255, 255, 255, 9 };
test "field envelope preserves attrs command instance ID and tail" {
    const p = try P.parse(&raw);
    try t.expectEqual(0x8001, p.attributes);
    try t.expectEqual(255, p.other);
    try t.expectEqualSlices(u8, raw[7..17], p.command);
    try t.expectEqual(0xffffffff, p.instance_id);
    try t.expectEqualSlices(u8, &.{9}, p.extra);
    var unicode = raw;
    @memcpy(unicode[7..17], &[_]u8{ 0, 0, 0, 0xd8, 0xff, 0xfe, 0, 0xdc, 0xff, 0xff });
    try t.expectEqualSlices(u8, unicode[7..17], (try P.parse(&unicode)).command);
    for (0..21) |n| try t.expectError(error.UnexpectedEnd, P.parse(raw[0..n]));
}
test "memo identity is directional with bounded command marker and code" {
    try t.expectEqual(.observed_memo, try identity.resolve(id("%%me"), id("%unk"), 3, &raw));
    try t.expectEqual(.exact, try identity.resolve(id("%unk"), id("%unk"), 3, &.{}));
    for ([_]u16{ 1, 2, 4, 11, 23 }) |code| try t.expectError(error.ControlIdMismatch, identity.resolve(id("%%me"), id("%unk"), code, &raw));
    try t.expectError(error.ControlIdMismatch, identity.resolve(id("%unk"), id("%%me"), 3, &raw));
    try t.expectError(error.ControlIdMismatch, identity.resolve(id("%hlk"), id("%unk"), 3, &raw));
    var changed = raw;
    changed[7] = 'm';
    try t.expectError(error.ControlIdMismatch, identity.resolve(id("%%me"), id("%unk"), 3, &changed));
    for (0..21) |n| try t.expectError(error.UnexpectedEnd, identity.resolve(id("%%me"), id("%unk"), 3, raw[0..n]));
}
fn allocationCase(a: std.mem.Allocator) !void {
    var bytes = [_]u8{0} ** 78;
    std.mem.writeInt(u32, bytes[0..4], 66 | (24 << 20), .little);
    std.mem.writeInt(u32, bytes[28..32], 67 | (1 << 10) | (16 << 20), .little);
    std.mem.writeInt(u16, bytes[32..34], 3, .little);
    std.mem.writeInt(u32, bytes[34..38], id("%%me"), .little);
    std.mem.writeInt(u16, bytes[46..48], 3, .little);
    std.mem.writeInt(u32, bytes[48..52], 71 | (1 << 10) | (26 << 20), .little);
    std.mem.writeInt(u32, bytes[52..56], id("%unk"), .little);
    @memcpy(bytes[56..], &raw);
    var tree = try @import("tree.zig").Tree.parse(a, &bytes, .{ .raw = 0x05010001 }, .{});
    defer tree.deinit(a);
    var links = try @import("control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    try t.expectEqual(1, links.observedCount());
    try t.expectEqual(id("%%me"), links.items[0].id);
    try t.expectEqual(id("%unk"), links.items[0].header_id);
}
test "observed identity keeps both IDs through allocation failures" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
}
