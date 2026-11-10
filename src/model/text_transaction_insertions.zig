//! Output-coordinate spans only. No source, owner, resource or History authority.
const std = @import("std");
const edits_model = @import("independent_text_edits.zig");
const m = @import("text_transaction.zig");
pub const Range = @import("formatting_patch.zig").Range;
/// Caller owns the returned slice. Uses the existing transaction limits/shape
/// validator; actual expected text, scalars and controls remain adapter checks.
/// Identical-text replacements remain included: explicit insertion formatting
/// is independent of whether the text splice itself is a semantic no-op.
/// Adjacent output intervals share the same group intent and can be coalesced.
pub fn prepare(a: std.mem.Allocator, edits: []const edits_model.Edit, before_units: u32) ![]Range {
    _ = try edits_model.validate(edits, before_units, .{ .max_edits = m.limits.edits_count, .max_inserted_bytes = m.limits.inserted_bytes, .max_output_units = m.limits.text_units });
    var output: std.ArrayList(Range) = .empty;
    errdefer output.deinit(a);
    var removed: u32 = 0;
    var inserted: u32 = 0;
    for (edits) |edit| {
        const units = try edits_model.utf16Units(edit.text);
        const start = std.math.add(u32, edit.start - removed, inserted) catch return error.LimitExceeded;
        const end = std.math.add(u32, start, units) catch return error.LimitExceeded;
        if (units != 0) {
            if (output.items.len != 0 and output.items[output.items.len - 1].endUnit == start) {
                output.items[output.items.len - 1].endUnit = end;
            } else try output.append(a, .{ .startUnit = start, .endUnit = end });
        }
        removed = std.math.add(u32, removed, edit.end - edit.start) catch return error.LimitExceeded;
        inserted = std.math.add(u32, inserted, units) catch return error.LimitExceeded;
    }
    return output.toOwnedSlice(a);
}

test "text transaction insertions output axis emoji deletion adjacency no-op and allocation failures" {
    const a = std.testing.allocator;
    const edits = [_]edits_model.Edit{ .{ .start = 0, .end = 1, .text = "😀", .expected = "A" }, .{ .start = 1, .end = 2, .text = "", .expected = "B" }, .{ .start = 2, .end = 2, .text = "Z", .expected = "" }, .{ .start = 4, .end = 5, .text = "E", .expected = "E" } };
    const ranges = try prepare(a, &edits, 5);
    defer a.free(ranges);
    try std.testing.expectEqualDeep(@as([]const Range, &.{ .{ .startUnit = 0, .endUnit = 3 }, .{ .startUnit = 5, .endUnit = 6 } }), @as([]const Range, ranges));
    const empty = try prepare(a, &.{.{ .start = 0, .end = 1, .text = "" }}, 1);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    try std.testing.expectError(error.InvalidTextPosition, prepare(a, &.{.{ .start = 0, .end = 2, .text = "X" }}, 1));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator) !void {
            const rows = try prepare(allocator, &edits, 5);
            defer allocator.free(rows);
        }
    }.run, .{});
}

test "text transaction insertions N 2N 4N many edits original output coordinates" {
    const a = std.testing.allocator;
    for ([_]usize{ 32, 64, 128 }) |n| {
        const edits = try a.alloc(edits_model.Edit, n);
        defer a.free(edits);
        for (edits, 0..) |*edit, i| edit.* = .{ .start = @intCast(i * 2), .end = @intCast(i * 2 + 1), .text = "😀", .expected = "A" };
        const ranges = try prepare(a, edits, @intCast(n * 2));
        defer a.free(ranges);
        try std.testing.expectEqual(n, ranges.len);
        for (ranges, 0..) |r, i| {
            try std.testing.expectEqual(@as(u32, @intCast(i * 3)), r.startUnit);
            try std.testing.expectEqual(@as(u32, @intCast(i * 3 + 2)), r.endUnit);
        }
        std.debug.print("H01 range helper edits={} emitted={} output_units={} structural=existing-validator+one-forward-emission no-source-scan\n", .{ n, ranges.len, n * 3 });
    }
}
