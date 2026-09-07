const std = @import("std");
const t = std.testing;
const projection = @import("revision_text.zig");
fn frame(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u32, level: u32, payload: []const u8) !void {
    var h: [4]u8 = undefined;
    std.mem.writeInt(u32, &h, tag | (level << 10) | (@as(u32, @intCast(payload.len)) << 20), .little);
    try out.appendSlice(a, &h);
    try out.appendSlice(a, payload);
}
fn fixture(a: std.mem.Allocator) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (0..4) |i| {
        const level: u32 = if (i == 1 or i == 2) 1 else 0;
        if (i == 1) try frame(a, &out, 72, 1, &.{ 2, 0, 0, 0, 0, 0, 0, 0 });
        var header = [_]u8{0} ** 24;
        header[0] = 2;
        header[14] = if (i < 2) 1 else 0;
        header[22] = if (i > 1) 1 else 0;
        try frame(a, &out, 66, level, &header);
        try frame(a, &out, 67, level + 1, &.{ "AXYB"[i], 0, 13, 0 });
        if (i < 2) try frame(a, &out, 70, level + 1, &.{ 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 17 });
    }
    return out.toOwnedSlice(a);
}
fn build(a: std.mem.Allocator, options: projection.Options) !projection.Report {
    const bytes = try fixture(a);
    defer a.free(bytes);
    var tree = try @import("tree.zig").Tree.parse(a, bytes, .{ .raw = 0x05000307 }, .{});
    defer tree.deinit(a);
    var lists = try @import("list_groups.zig").Groups.build(a, tree);
    defer lists.deinit(a);
    var flows = try @import("paragraph_flows.zig").Flows.build(a, tree, lists.items);
    defer flows.deinit(a);
    var index = try @import("revision_groups.zig").Index.buildObserved(a, tree, flows);
    defer index.deinit(a);
    return projection.collectObserved(a, tree, index, options);
}
fn exercise(a: std.mem.Allocator, late: bool) !void {
    var report = build(a, .{ .max_total_input_bytes = 16, .max_total_output_bytes = if (late) 11 else 12, .max_total_ranges = 2 }) catch |err| {
        if (late and err == error.RevisionProjectionOutputLimit) return;
        return err;
    };
    defer report.deinit(a);
    try t.expect(!late);
    // All input/context allocations have already been freed by build().
    try t.expectEqualSlices(u8, &.{ 'A', 0, 'B', 0, 13, 0 }, report.groups[0].text);
    try t.expectEqualSlices(u8, &.{ 'X', 0, 'Y', 0, 13, 0 }, report.groups[1].text);
    try t.expectEqual(@as(u64, 2), report.members[3].source_start);
    try t.expectEqual(@as(u64, 1), report.members[3].projected_start);
    try t.expectEqual(@as(usize, 16), report.total_input_bytes);
    try t.expectEqual(@as(usize, 12), report.total_output_bytes);
    try t.expectEqual(@as(usize, 2), report.total_ranges);
    const removed = try report.mapBoundary(report.members[0].paragraph_node, 1);
    try t.expectEqual(@as(u64, 1), removed.projected_unit);
    try t.expect(removed.removed_unit);
    const end = try report.mapBoundary(report.members[0].paragraph_node, 2);
    try t.expectEqual(removed.projected_unit, end.projected_unit);
    try t.expect(!end.removed_unit);
    const next = try report.mapBoundary(report.members[3].paragraph_node, 0);
    try t.expectEqual(@as(u64, 1), next.projected_unit);
    try t.expectEqual(@as(usize, 0), next.group_index);
    try t.expectError(error.InvalidRevisionMember, report.mapBoundary(0xffffffff, 0));
    try t.expectError(error.RevisionCoordinateOutOfBounds, report.mapBoundary(report.members[0].paragraph_node, 3));
}
test "revision text owns output across nested flows and cleans every allocation failure" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, exercise, .{true});
}
test "revision text shares budgets across paragraphs and retains per-paragraph caps" {
    try t.expectError(error.RevisionProjectionInputLimit, build(t.allocator, .{ .max_total_input_bytes = 15 }));
    try t.expectError(error.RevisionProjectionRangeLimit, build(t.allocator, .{ .max_total_ranges = 1 }));
    try t.expectError(error.RevisionProjectionInputLimit, build(t.allocator, .{ .paragraph = .{ .max_input_bytes = 3 } }));
    try t.expectError(error.RevisionProjectionOutputLimit, build(t.allocator, .{ .paragraph = .{ .max_output_bytes = 3 } }));
}
