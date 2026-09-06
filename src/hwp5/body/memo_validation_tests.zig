const std = @import("std");
const t = std.testing;
const validation = @import("memo_validation.zig");
fn inspect(a: std.mem.Allocator, b: []const u8) !validation.Report {
    var tree = try @import("tree.zig").Tree.parse(a, b, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var groups = try @import("list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    return validation.inspect(tree, groups.items);
}
fn fixture() [84]u8 {
    var b = [_]u8{0} ** 84;
    for ([_]usize{ 0, 56 }) |at| std.mem.writeInt(u32, b[at..][0..4], 66 | (24 << 20) | (if (at == 0) @as(u32, 0) else 1024), .little);
    std.mem.writeInt(u32, b[28..32], 93 | 1024 | (4 << 20), .little);
    std.mem.writeInt(u32, b[36..40], 72 | 1024 | (16 << 20), .little);
    b[40] = 1;
    return b;
}
fn exercise(a: std.mem.Allocator) !void {
    const b = fixture();
    try t.expectEqualDeep(validation.Report{ .markers = 1, .paragraphs = 1 }, try inspect(a, &b));
}
test "memo ownership successful allocations and failed cleanup" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}
test "memo ownership rejects unmatched markers without inferring index uniqueness" {
    var b = fixture();
    try t.expectError(error.MissingMemoListHeader, inspect(t.allocator, b[0..36]));
    const duplicate = b[0..36].* ++ b[28..].*;
    try t.expectError(error.MissingMemoListHeader, inspect(t.allocator, &duplicate));
    b[0] = 255; // Non-paragraph owner, same valid hierarchy.
    try t.expectError(error.OrphanMemoList, inspect(t.allocator, &b));
    b = fixture();
    const paired_duplicates = b[0..28].* ++ b[28..].* ++ b[28..].*;
    try t.expectEqual(2, (try inspect(t.allocator, &paired_duplicates)).markers);
    b[40] = 0;
    try t.expectEqual(0, (try inspect(t.allocator, b[0..56])).paragraphs);
}
