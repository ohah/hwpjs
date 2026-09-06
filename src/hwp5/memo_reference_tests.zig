const std = @import("std");
const t = std.testing;
const m = @import("memo_references.zig");
fn exercise(a: std.mem.Allocator) !void {
    var index: m.Index = .{};
    defer index.deinit(a);
    try index.addField(a, 3, 0);
    try index.addField(a, null, 3);
    try index.addField(a, 1, 1);
    try index.addField(a, 2, 2);
    try index.addField(a, 1, 0);
    try index.addList(a, 4, 0);
    try index.addList(a, 3, 1);
    try index.addList(a, 1, 1);
    try index.addList(a, 3, 0);
    const expected: m.Report = .{ .fields = 5, .lists = 4, .missing_indices = 1, .matched_fields = 2, .cross_section_fields = 1, .missing_targets = 1, .ambiguous_fields = 1, .unreferenced_lists = 1, .duplicate_field_ids = 1, .duplicate_list_ids = 1 };
    const report = index.inspect();
    try t.expectEqualDeep(expected, report);
    try t.expectEqualDeep(report, index.inspect());
    try t.expectError(error.MissingMemoTarget, report.validateKnown());
}
test "global memo index bounded allocation failures and diagnostic partition" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}
test "memo IDs zero and UINT32_MAX are not absence and unreferenced lists are diagnostic" {
    var index: m.Index = .{};
    defer index.deinit(t.allocator);
    try index.inspect().validateKnown();
    try index.addField(t.allocator, null, 0);
    try index.addField(t.allocator, 0xffffffff, 33);
    try index.addField(t.allocator, 0, 0);
    try index.addList(t.allocator, 0, 0);
    try index.addList(t.allocator, 0xffffffff, 1);
    try index.addList(t.allocator, 1, 2);
    var report = index.inspect();
    try report.validateKnown();
    try t.expectEqual(1, report.missing_indices);
    try t.expectEqual(2, report.matched_fields);
    try t.expectEqual(1, report.cross_section_fields);
    try t.expectEqual(1, report.unreferenced_lists);
    try index.addList(t.allocator, 0, 3);
    report = index.inspect();
    try t.expectEqual(1, report.ambiguous_fields);
    try t.expectError(error.AmbiguousMemoTarget, report.validateKnown());
}
