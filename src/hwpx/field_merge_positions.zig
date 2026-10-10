//! 마커 식별자는 유지하고 오른쪽 UTF-16 좌표만 병합 경계만큼 이동합니다.
const std = @import("std");
const Position = @import("field_position.zig").Position;

pub fn prepare(a: std.mem.Allocator, left: []const Position, right: []const Position, boundary: usize, limit: usize) ![]Position {
    const count = std.math.add(usize, left.len, right.len) catch return error.LimitExceeded;
    if (count > limit) return error.LimitExceeded;
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for ([_][]const Position{ left, right }, 0..) |items, side| {
        for (items, 0..) |item, index| {
            if (index != 0 and item.unit < items[index - 1].unit) return error.InvalidFieldPositions;
            if (side == 0 and item.unit > boundary) return error.InvalidFieldPositions;
            const entry = try seen.getOrPut(a, item.element_index);
            if (entry.found_existing) return error.SourceBindingMismatch;
            if (side == 1) _ = std.math.add(usize, boundary, item.unit) catch return error.LimitExceeded;
        }
    }
    const result = try a.alloc(Position, count);
    @memcpy(result[0..left.len], left);
    for (right, result[left.len..]) |item, *target| {
        target.* = item;
        target.unit = boundary + item.unit;
    }
    return result;
}

test "field merge positions preserve cross-source identity and reject duplicate ownership" {
    const a = std.testing.allocator;
    const left = [_]Position{.{ .element_index = 3, .begin_element = 3, .kind = .begin, .unit = 0 }};
    const right = [_]Position{.{ .element_index = 20, .begin_element = 3, .kind = .end, .unit = 2 }};
    const merged = try prepare(a, &left, &right, 3, 2);
    defer a.free(merged);
    try std.testing.expectEqual(@as(usize, 5), merged[1].unit);
    try std.testing.expectEqual(@as(usize, 3), merged[1].begin_element);
    try std.testing.expectEqual(@as(usize, 2), right[0].unit);
    try std.testing.expectError(error.SourceBindingMismatch, prepare(a, &left, &left, 3, 2));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &left, &right, std.math.maxInt(usize), 2));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &left, &right, 3, 1));
    try std.testing.expectError(error.InvalidFieldPositions, prepare(a, &right, &.{}, 1, 2));
    const reversed = [_]Position{ right[0], left[0] };
    try std.testing.expectError(error.InvalidFieldPositions, prepare(a, &.{}, &reversed, 0, 2));
    const empty = try prepare(a, &.{}, &.{}, 0, 0);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
}

fn allocationCase(a: std.mem.Allocator) !void {
    const left = [_]Position{.{ .element_index = 3, .begin_element = 3, .kind = .begin, .unit = 0 }};
    const right = [_]Position{.{ .element_index = 20, .begin_element = 3, .kind = .end, .unit = 2 }};
    const result = try prepare(a, &left, &right, 3, 2);
    defer a.free(result);
    try std.testing.expectEqual(@as(usize, 5), result[1].unit);
    try std.testing.expectEqual(@as(usize, 0), left[0].unit);
    try std.testing.expectEqual(@as(usize, 2), right[0].unit);
}

test "field merge positions allocation failures keep borrowed source unchanged" {
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
