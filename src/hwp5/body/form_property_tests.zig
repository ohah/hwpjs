const std = @import("std");
const t = std.testing;
const token = @import("form_property.zig");
const tree = @import("form_property_tree.zig");
fn wide(comptime s: []const u8) [s.len * 2]u8 {
    var bytes = [_]u8{0} ** (s.len * 2);
    for (s, 0..) |c, i| bytes[i * 2] = c;
    return bytes;
}
const body = "A:int:1 B:wstring:3:x y ";
const input = wide(std.fmt.comptimePrint("G:set:{d}:{s} C:bool:-1 ", .{ body.len, body }));
fn exercise(a: std.mem.Allocator, late: bool) !void {
    const bad = input ++ wide("Bad:other:0");
    var parsed = tree.Tree.parseObservedUnits(a, if (late) &bad else &input, .{}) catch |err| {
        if (late and err == error.UnsupportedFormPropertyType) return;
        return err;
    };
    defer parsed.deinit(a);
    try t.expect(!late);
    try t.expectEqual(@as(usize, 4), parsed.nodes.len);
    try t.expectEqual(@as(usize, 3), parsed.nodes[0].subtree_end);
    try t.expectEqual(@as(?usize, 0), parsed.nodes[1].parent);
    try t.expectEqual(@as(?usize, 0), parsed.nodes[2].parent);
    try t.expectEqual(@as(?usize, null), parsed.nodes[3].parent);
    try t.expectEqualSlices(u8, &wide("x y"), parsed.nodes[2].property.value);
    try t.expectEqualSlices(u8, &wide("-1"), parsed.nodes[3].property.value);
    const p = parsed.nodes[2].property;
    try t.expectEqualSlices(u8, input[p.offset..][0..p.raw.len], p.raw);
    try t.expectEqualSlices(u8, input[p.value_offset..][0..p.value.len], p.value);
}
test "form property tree preserves scope and cleans all success and late-error allocations" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, exercise, .{true});
}
test "form property iterator failure is atomic and counted values cannot cross scope" {
    var iter = try token.Iterator.initObservedUnits(&wide("  A:wstring:4:X"));
    for (0..2) |_| {
        try t.expectError(error.UnexpectedEnd, iter.next());
        try t.expectEqual(@as(usize, 0), iter.offset);
    }
    try t.expectError(error.InvalidFormPropertyEncoding, token.Iterator.initObservedUnits(&.{0}));
    // Parent only owns A:int:, so the outside 1 cannot finish its child value.
    try t.expectError(error.InvalidFormPropertyNumber, tree.Tree.parseObservedUnits(t.allocator, &wide("G:set:6:A:int: 1"), .{}));
}
test "form property tree shares node depth and input budgets without recursion" {
    var parsed = try tree.Tree.parseObservedUnits(t.allocator, &input, .{ .max_input_bytes = input.len, .max_nodes = 4, .max_depth = 1 });
    defer parsed.deinit(t.allocator);
    try t.expectError(error.FormPropertyInputLimit, tree.Tree.parseObservedUnits(t.allocator, &input, .{ .max_input_bytes = input.len - 1 }));
    try t.expectError(error.FormPropertyNodeLimit, tree.Tree.parseObservedUnits(t.allocator, &input, .{ .max_nodes = 3 }));
    try t.expectError(error.FormPropertyDepthLimit, tree.Tree.parseObservedUnits(t.allocator, &input, .{ .max_depth = 0 }));
}
test "textual length error classification does not depend on pointer width" {
    var iter = try token.Iterator.initObservedUnits(&wide("A:wstring:4294967296:x"));
    try t.expectError(error.UnexpectedEnd, iter.next());
    try t.expectEqual(@as(usize, 0), iter.offset);
    var overflow = try token.Iterator.initObservedUnits(&wide("A:wstring:18446744073709551616:x"));
    try t.expectError(error.FormPropertyLengthOverflow, overflow.next());
}
fn nested(comptime depth: usize, comptime leaf: []const u8) []const u8 {
    if (depth == 0) return leaf;
    const inner = nested(depth - 1, leaf);
    return std.fmt.comptimePrint("G:set:{d}:{s}", .{ inner.len, inner });
}
fn deepExercise(a: std.mem.Allocator, late: bool) !void {
    const good = comptime blk: {
        @setEvalBranchQuota(100_000);
        break :blk wide(nested(32, "A:int:1"));
    };
    const bad = comptime blk: {
        @setEvalBranchQuota(100_000);
        break :blk wide(nested(32, "A:other:1"));
    };
    var parsed = tree.Tree.parseObservedUnits(a, if (late) &bad else &good, .{}) catch |err| {
        if (late and err == error.UnsupportedFormPropertyType) return;
        return err;
    };
    defer parsed.deinit(a);
    try t.expect(!late);
    try t.expectEqual(@as(usize, 33), parsed.nodes.len);
    for (parsed.nodes, 0..) |n, i| {
        try t.expectEqual(@as(usize, 33), n.subtree_end);
        try t.expectEqual(if (i == 0) @as(?usize, null) else i - 1, n.parent);
    }
}
test "nested form property stack and node growth release every failed allocation" {
    try t.checkAllAllocationFailures(t.allocator, deepExercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, deepExercise, .{true});
}
