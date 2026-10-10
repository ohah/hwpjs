//! Atomic boundary drafts; callers commit them with the text transaction.
const std = @import("std");
const coordinates = @import("column_boundary_position.zig");
const Position = coordinates.Position;

pub fn splice(a: std.mem.Allocator, original: []const Position, start: u32, end: u32, inserted: u32, text_units: u32, limit: usize) ![]Position {
    // Validate empty arrays too, without introducing a second coordinate rule.
    _ = try coordinates.splice(.{ .source_element = 0, .unit = 0, .affinity = .left }, start, end, inserted, text_units);
    if (original.len > limit) return error.LimitExceeded;
    const result = try a.alloc(Position, original.len);
    errdefer a.free(result);
    for (original, result) |position, *target| target.* = try coordinates.splice(position, start, end, inserted, text_units);
    return result;
}

pub const Split = struct {
    left: []Position,
    right: []Position,
    pub fn deinit(self: *Split, a: std.mem.Allocator) void {
        a.free(self.left);
        a.free(self.right);
        self.* = undefined;
    }
};

pub fn split(a: std.mem.Allocator, original: []const Position, at: u32, text_units: u32, limit: usize) !Split {
    _ = try coordinates.split(.{ .source_element = 0, .unit = 0, .affinity = .left }, at, text_units);
    if (original.len > limit) return error.LimitExceeded;
    var left_count: usize = 0;
    for (original) |position| if (!(try coordinates.split(position, at, text_units)).right) {
        left_count += 1;
    };
    const left = try a.alloc(Position, left_count);
    errdefer a.free(left);
    const right = try a.alloc(Position, original.len - left_count);
    errdefer a.free(right);
    var l: usize = 0;
    var r: usize = 0;
    for (original) |position| {
        const partition = try coordinates.split(position, at, text_units);
        if (partition.right) {
            right[r] = partition.position;
            r += 1;
        } else {
            left[l] = partition.position;
            l += 1;
        }
    }
    return .{ .left = left, .right = right };
}

/// Concatenate boundaries without removing a column-setting transition.
/// Both arrays must use element identities from the same source tree.
pub fn merge(a: std.mem.Allocator, left: []const Position, right: []const Position, left_units: u32, right_units: u32, limit: usize) ![]Position {
    _ = std.math.add(u32, left_units, right_units) catch return error.LimitExceeded;
    const count = std.math.add(usize, left.len, right.len) catch return error.LimitExceeded;
    if (count > limit) return error.LimitExceeded;
    const result = try a.alloc(Position, count);
    errdefer a.free(result);
    var sources: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer sources.deinit(a);
    for ([_][]const Position{ left, right }, 0..) |side, side_index| {
        const length = if (side_index == 0) left_units else right_units;
        const offset: u32 = if (side_index == 0) 0 else left_units;
        const first = if (side_index == 0) 0 else left.len;
        for (side, 0..) |position, index| {
            _ = try coordinates.split(position, 0, length);
            if ((try sources.getOrPut(a, position.source_element)).found_existing) return error.DuplicateColumnBoundary;
            result[first + index] = position;
            result[first + index].unit = std.math.add(u32, position.unit, offset) catch return error.LimitExceeded;
        }
    }
    return result;
}

test "column boundary merge restores split coordinates and rejects duplicate provenance" {
    const a = std.testing.allocator;
    const original = [_]Position{
        .{ .source_element = 10, .unit = 0, .affinity = .right },
        .{ .source_element = 11, .unit = 3, .affinity = .left },
        .{ .source_element = 12, .unit = 3, .affinity = .right },
        .{ .source_element = 13, .unit = 8, .affinity = .left },
    };
    for (0..9) |at| {
        var parts = try split(a, &original, @intCast(at), 8, 4);
        defer parts.deinit(a);
        const joined = try merge(a, parts.left, parts.right, @intCast(at), @intCast(8 - at), 4);
        defer a.free(joined);
        try std.testing.expectEqualSlices(Position, &original, joined);
    }
    try std.testing.expectError(error.DuplicateColumnBoundary, merge(a, original[0..1], original[0..1], 8, 8, 2));
    try std.testing.expectError(error.InvalidTextPosition, merge(a, &.{}, original[3..], 0, 7, 1));
    try std.testing.expectError(error.LimitExceeded, merge(a, &.{}, &.{}, std.math.maxInt(u32), 1, 0));
    try std.testing.expectError(error.LimitExceeded, merge(a, original[0..2], original[2..], 8, 8, 3));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const Position) !void {
            const joined = try merge(allocator, source[0..2], source[2..], 8, 8, 4);
            defer allocator.free(joined);
            try std.testing.expectEqual(@as(u32, 11), joined[2].unit);
            try std.testing.expectEqual(@as(u32, 16), joined[3].unit);
        }
    }.run, .{&original});
}

test "column boundary drafts preserve order source ownership and every failed allocation" {
    const a = std.testing.allocator;
    const original = [_]Position{
        .{ .source_element = 9, .unit = 0, .affinity = .right },
        .{ .source_element = 7, .unit = 3, .affinity = .left },
        .{ .source_element = 8, .unit = 3, .affinity = .right },
        .{ .source_element = 6, .unit = 8, .affinity = .right },
    };
    const changed = try splice(a, &original, 3, 3, 2, 8, 4);
    defer a.free(changed);
    for (changed, [_]u32{ 0, 3, 5, 10 }, original) |actual, unit, source| {
        try std.testing.expectEqual(unit, actual.unit);
        try std.testing.expectEqual(source.source_element, actual.source_element);
    }
    var divided = try split(a, &original, 3, 8, 4);
    defer divided.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), divided.left.len);
    try std.testing.expectEqual(@as(usize, 2), divided.right.len);
    try std.testing.expectEqual(original[1], divided.left[1]);
    try std.testing.expectEqual(@as(usize, 8), divided.right[0].source_element);
    try std.testing.expectEqual(@as(u32, 0), divided.right[0].unit);
    try std.testing.expectEqual(@as(u32, 5), divided.right[1].unit);
    try std.testing.expectError(error.ProtectedColumnBoundary, splice(a, &original, 2, 4, 0, 8, 4));
    try std.testing.expectError(error.LimitExceeded, split(a, &original, 3, 8, 3));
    try std.testing.expectError(error.InvalidTextPosition, split(a, &.{}, 1, 0, 0));
    try std.testing.expectError(error.InvalidTextPosition, splice(a, &.{}, 1, 0, 0, 0, 0));
    try std.testing.expectError(error.LimitExceeded, splice(a, &.{}, 0, 0, 1, std.math.maxInt(u32), 0));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const Position) !void {
            const moved = try splice(allocator, source, 3, 3, 2, 8, 4);
            defer allocator.free(moved);
            var parts = try split(allocator, source, 3, 8, 4);
            defer parts.deinit(allocator);
        }
    }.run, .{&original});
    try std.testing.expectEqual(@as(u32, 3), original[2].unit);
}
