//! Owned zero-width title positions; coordinate transforms never serialize XML.
const std = @import("std");
pub const Position = struct { element_index: usize, unit: usize, affinity: enum { left, right } = .right };
pub fn merge(a: std.mem.Allocator, left: []const Position, right: []const Position, left_units: usize, right_units: usize) ![]Position {
    const count = std.math.add(usize, left.len, right.len) catch return error.LimitExceeded;
    const output = try a.alloc(Position, count);
    errdefer a.free(output);
    var seen: std.AutoHashMap(usize, void) = .init(a);
    defer seen.deinit();
    for (left, output[0..left.len]) |position, *target| {
        if (position.unit > left_units) return error.SourceBindingMismatch;
        if ((try seen.getOrPut(position.element_index)).found_existing) return error.SourceBindingMismatch;
        target.* = position;
    }
    for (right, output[left.len..]) |position, *target| {
        if (position.unit > right_units) return error.SourceBindingMismatch;
        if ((try seen.getOrPut(position.element_index)).found_existing) return error.SourceBindingMismatch;
        target.* = position;
        target.unit = std.math.add(usize, left_units, position.unit) catch return error.LimitExceeded;
    }
    return output;
}
pub fn side(a: std.mem.Allocator, input: []const Position, at: usize, end: usize, right: bool) ![]Position {
    if (end < at) return error.InvalidTextPosition;
    var result: std.ArrayList(Position) = .empty;
    defer result.deinit(a);
    for (input) |position| {
        const belongs_right = position.unit > end or (position.unit >= at and position.affinity == .right);
        if (belongs_right != right) continue;
        var moved = position;
        moved.unit = if (right) position.unit -| end else @min(position.unit, at);
        try result.append(a, moved);
    }
    return result.toOwnedSlice(a);
}
pub fn splice(a: std.mem.Allocator, input: []const Position, at: usize, deleted: usize, inserted: usize) ![]Position {
    const end = std.math.add(usize, at, deleted) catch return error.LimitExceeded;
    const result = try a.dupe(Position, input);
    errdefer a.free(result);
    for (result) |*position| {
        if (position.unit < at or (position.unit == at and position.affinity == .left)) continue;
        const base = if (position.unit <= end) at else position.unit - deleted;
        position.unit = std.math.add(usize, base, inserted) catch return error.LimitExceeded;
    }
    return result;
}

test "mixed title position split affinity splice and allocation failures" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            const input = [_]Position{
                .{ .element_index = 1, .unit = 0 },
                .{ .element_index = 2, .unit = 3, .affinity = .left },
                .{ .element_index = 3, .unit = 3 },
                .{ .element_index = 4, .unit = 8 },
            };
            const left = try side(a, &input, 3, 3, false);
            defer a.free(left);
            const right = try side(a, &input, 3, 3, true);
            defer a.free(right);
            try std.testing.expectEqual(@as(usize, 2), left.len);
            try std.testing.expectEqual(@as(usize, 2), right.len);
            try std.testing.expectEqual(@as(usize, 3), left[1].unit);
            try std.testing.expectEqual(@as(usize, 0), right[0].unit);
            try std.testing.expectEqual(@as(usize, 5), right[1].unit);
            const restored = try merge(a, left, right, 3, 5);
            defer a.free(restored);
            try std.testing.expectEqual(input.len, restored.len);
            for (input, restored) |source, current| try std.testing.expectEqualDeep(source, current);
            const moved = try splice(a, &input, 3, 0, 4);
            defer a.free(moved);
            try std.testing.expectEqual(@as(usize, 3), moved[1].unit);
            try std.testing.expectEqual(@as(usize, 7), moved[2].unit);
            try std.testing.expectEqual(@as(usize, 12), moved[3].unit);
            try std.testing.expectEqual(@as(usize, 3), input[2].unit);
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidTextPosition, side(std.testing.allocator, &.{}, 2, 1, false));
    try std.testing.expectError(error.LimitExceeded, splice(std.testing.allocator, &.{}, std.math.maxInt(usize), 1, 0));
    try std.testing.expectError(error.SourceBindingMismatch, merge(std.testing.allocator, &.{.{ .element_index = 1, .unit = 0 }}, &.{.{ .element_index = 1, .unit = 0 }}, 0, 0));
    try std.testing.expectError(error.SourceBindingMismatch, merge(std.testing.allocator, &.{.{ .element_index = 1, .unit = 1 }}, &.{}, 0, 0));
    try std.testing.expectError(error.LimitExceeded, merge(std.testing.allocator, &.{}, &.{.{ .element_index = 1, .unit = 1 }}, std.math.maxInt(usize), 1));
}
