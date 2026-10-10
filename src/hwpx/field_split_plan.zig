//! 검증된 폭 없는 필드 위치를 분할 후 좌우 좌표로 투영합니다.
//! 문단 텍스트 분할·XML 저장·전역 필드 연결은 호출하는 계층이 소유합니다.
const std = @import("std");
const Position = @import("field_source_positions.zig").Position;

pub const Side = enum { left, right };
pub const Move = struct {
    position: Position,
    side: Side,
    unit: usize,
};

pub fn build(a: std.mem.Allocator, positions: []const Position, start: usize, end: usize, length: usize, limit: usize) ![]Move {
    if (end < start or end > length) return error.InvalidTextPosition;
    if (positions.len > limit) return error.LimitExceeded;
    const Pair = struct { begin: ?usize = null, end: ?usize = null };
    var pairs: std.AutoHashMapUnmanaged(usize, Pair) = .empty;
    defer pairs.deinit(a);
    const result = try a.alloc(Move, positions.len);
    errdefer a.free(result);
    for (positions, 0..) |position, index| {
        if (position.unit > length) return error.InvalidFieldPositions;
        if (index != 0 and (position.element_index <= positions[index - 1].element_index or position.unit < positions[index - 1].unit)) return error.InvalidFieldPositions;
        if (position.kind == .begin and position.begin_element != position.element_index) return error.InvalidFieldPositions;
        if (position.kind == .end and position.begin_element >= position.element_index) return error.InvalidFieldPositions;
        const entry = try pairs.getOrPut(a, position.begin_element);
        if (!entry.found_existing) entry.value_ptr.* = .{};
        if (position.kind == .begin) {
            if (entry.value_ptr.begin != null) return error.InvalidFieldPositions;
            entry.value_ptr.begin = index;
        } else {
            if (entry.value_ptr.end != null) return error.InvalidFieldPositions;
            entry.value_ptr.end = index;
        }
        const left = if (position.kind == .begin) position.unit < start else position.unit <= end;
        result[index] = .{ .position = position, .side = if (left) .left else .right, .unit = if (left) @min(position.unit, start) else position.unit -| end };
    }
    var iterator = pairs.valueIterator();
    while (iterator.next()) |pair| {
        const begin = pair.begin orelse continue;
        const finish = pair.end orelse continue;
        if (positions[begin].unit >= start and positions[finish].unit <= end) {
            // 전체 선택으로 빈 필드가 된 경우나 경계의 기존 빈 필드는 함께 옮깁니다.
            result[begin].side = .right;
            result[finish].side = .right;
            result[begin].unit = 0;
            result[finish].unit = 0;
        }
    }
    return result;
}

test "HWPX field split plan retains boundary affinity empty pairs and cross paragraph ends" {
    const a = std.testing.allocator;
    const positions = [_]Position{
        .{ .element_index = 4, .begin_element = 4, .kind = .begin, .unit = 3 },
        .{ .element_index = 8, .begin_element = 4, .kind = .end, .unit = 6 },
    };
    for ([_]usize{ 0, 3, 4, 6, 9 }) |at| {
        const moves = try build(a, &positions, at, at, 9, 2);
        defer a.free(moves);
        try std.testing.expectEqual(if (at > 3) Side.left else Side.right, moves[0].side);
        try std.testing.expectEqual(if (at >= 6) Side.left else Side.right, moves[1].side);
    }
    const deleted = try build(a, &positions, 3, 6, 9, 2);
    defer a.free(deleted);
    for (deleted) |move| {
        try std.testing.expectEqual(.right, move.side);
        try std.testing.expectEqual(@as(usize, 0), move.unit);
    }
    const prefix_deleted = try build(a, &positions, 3, 5, 9, 2);
    defer a.free(prefix_deleted);
    try std.testing.expectEqual(.right, prefix_deleted[0].side);
    try std.testing.expectEqual(@as(usize, 0), prefix_deleted[0].unit);
    try std.testing.expectEqual(.right, prefix_deleted[1].side);
    try std.testing.expectEqual(@as(usize, 1), prefix_deleted[1].unit);
    const suffix_deleted = try build(a, &positions, 4, 6, 9, 2);
    defer a.free(suffix_deleted);
    try std.testing.expectEqual(.left, suffix_deleted[0].side);
    try std.testing.expectEqual(@as(usize, 3), suffix_deleted[0].unit);
    try std.testing.expectEqual(.left, suffix_deleted[1].side);
    try std.testing.expectEqual(@as(usize, 4), suffix_deleted[1].unit);
    const empty = [_]Position{
        .{ .element_index = 4, .begin_element = 4, .kind = .begin, .unit = 3 },
        .{ .element_index = 8, .begin_element = 4, .kind = .end, .unit = 3 },
    };
    const empty_moves = try build(a, &empty, 3, 3, 9, 2);
    defer a.free(empty_moves);
    for (empty_moves) |move| try std.testing.expectEqual(.right, move.side);
    const cross = [_]Position{
        .{ .element_index = 8, .begin_element = 2, .kind = .end, .unit = 0 },
        .{ .element_index = 9, .begin_element = 9, .kind = .begin, .unit = 0 },
    };
    const cross_moves = try build(a, &cross, 0, 0, 0, 2);
    defer a.free(cross_moves);
    try std.testing.expectEqual(.left, cross_moves[0].side);
    try std.testing.expectEqual(.right, cross_moves[1].side);
    try std.testing.expectError(error.InvalidTextPosition, build(a, &positions, 7, 6, 9, 2));
    try std.testing.expectError(error.LimitExceeded, build(a, &positions, 3, 3, 9, 1));
    var invalid = positions;
    invalid[1].element_index = invalid[0].element_index;
    try std.testing.expectError(error.InvalidFieldPositions, build(a, &invalid, 3, 3, 9, 2));
    invalid = positions;
    invalid[1].unit = 2;
    try std.testing.expectError(error.InvalidFieldPositions, build(a, &invalid, 3, 3, 9, 2));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const Position) !void {
            const moves = try build(allocator, source, 3, 6, 9, 2);
            defer allocator.free(moves);
        }
    }.run, .{&positions});
}
