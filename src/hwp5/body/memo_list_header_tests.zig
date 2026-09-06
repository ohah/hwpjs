const std = @import("std");
const t = std.testing;
const base = @import("list_header.zig").Header;
const Header = @import("memo_list_header.zig").Header;
test "memo list header retains full signed count dimensions flags and borrowed extra" {
    var b = [_]u8{0} ** 19;
    for ([_]u32{ 0x80000001, 0xfedcba98, 0x81234567, 0xffffffff }, 0..) |v, i| std.mem.writeInt(u32, b[i * 4 ..][0..4], v, .little);
    @memcpy(b[16..], &[_]u8{ 9, 128, 255 });
    const h = try Header.parse(try base.parse(&b));
    try t.expectEqual(@as(i32, @bitCast(@as(u32, 0x80000001))), h.paragraph_count);
    try t.expectEqual(0xfedcba98, h.attributes);
    try t.expectEqual(0x81234567, h.text_width);
    try t.expectEqual(0xffffffff, h.text_height);
    try t.expectEqualSlices(u8, b[16..], h.extra);
    try t.expectEqual(b[16..].ptr, h.extra.ptr);
    for (6..16) |cut| try t.expectError(error.UnexpectedEnd, Header.parse(try base.parse(b[0..cut])));
}
fn exercise(a: std.mem.Allocator) !void {
    const Tree = @import("tree.zig").Tree;
    const Groups = @import("list_groups.zig").Groups;
    // Root paragraph, memo marker, memo list header, one sibling paragraph.
    var b = [_]u8{0} ** 84;
    for ([_]usize{ 0, 56 }) |at| std.mem.writeInt(u32, b[at..][0..4], 66 | (24 << 20) | (if (at == 0) @as(u32, 0) else 1024), .little);
    std.mem.writeInt(u32, b[28..32], 93 | 1024 | (4 << 20), .little);
    std.mem.writeInt(u32, b[36..40], 72 | 1024 | (16 << 20), .little);
    b[40] = 1;
    var tree = try Tree.parse(a, &b, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var groups = try Groups.build(a, tree);
    defer groups.deinit(a);
    try t.expectEqual(1, groups.items.len);
    try t.expectEqual(1, groups.items[0].memo.?.node);
    try t.expectEqual(1, groups.items[0].memo.?.header.paragraph_count);
    b[42] = 1; // 65537, whose low 16 bits still equal the actual one paragraph.
    try reject(a, tree, error.ListParagraphCountMismatch);
    b[43] = 128;
    try reject(a, tree, error.NegativeMemoParagraphCount);
}
fn reject(a: std.mem.Allocator, tree: @import("tree.zig").Tree, expected: anyerror) !void {
    var groups = @import("list_groups.zig").Groups.build(a, tree) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    defer groups.deinit(a);
    return error.TestExpectedError;
}
test "memo group full count validation survives allocation failures" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}
