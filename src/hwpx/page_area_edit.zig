//! 소유 쪽 영역 배열의 분할·병합 후보입니다. XML과 문단 순서는 호출자 책임입니다.
const std = @import("std");
const coordinates = @import("page_area_position.zig");
const Position = coordinates.Position;
pub const Split = struct {
    left: []Position,
    right: []Position,
    pub fn deinit(self: *Split, a: std.mem.Allocator) void {
        a.free(self.left);
        a.free(self.right);
        self.* = undefined;
    }
};

fn validate(a: std.mem.Allocator, positions: []const Position, length: u32, limit: usize) !void {
    if (positions.len > limit) return error.LimitExceeded;
    var sources: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer sources.deinit(a);
    for (positions, 0..) |position, index| {
        if (position.unit > length) return error.InvalidTextPosition;
        if (position.affinity != coordinates.canonicalAffinity(position.unit)) return error.UnsupportedPageAreaAffinity;
        if (index != 0 and position.unit < positions[index - 1].unit) return error.InvalidPageAreaOrder;
        if ((try sources.getOrPut(a, position.source_element)).found_existing) return error.DuplicatePageAreaSource;
    }
}

pub fn split(a: std.mem.Allocator, positions: []const Position, at: u32, end: u32, length: u32, limit: usize) !Split {
    _ = try coordinates.splice(.{ .source_element = 0, .source_control = 0, .unit = 0 }, at, end, 0, length);
    try validate(a, positions, length, limit);
    const changed_length = length - (end - at);
    var left_count: usize = 0;
    for (positions) |position| {
        const moved = try coordinates.splice(position, at, end, 0, length);
        if (!(try coordinates.split(moved, at, changed_length)).right) left_count += 1;
    }
    const left = try a.alloc(Position, left_count);
    errdefer a.free(left);
    const right = try a.alloc(Position, positions.len - left_count);
    errdefer a.free(right);
    var l: usize = 0;
    var r: usize = 0;
    for (positions) |position| {
        const moved = try coordinates.splice(position, at, end, 0, length);
        var part = try coordinates.split(moved, at, changed_length);
        part.position.affinity = coordinates.canonicalAffinity(part.position.unit);
        if (part.right) {
            right[r] = part.position;
            r += 1;
        } else {
            left[l] = part.position;
            l += 1;
        }
    }
    return .{ .left = left, .right = right };
}

pub fn merge(a: std.mem.Allocator, left: []const Position, right: []const Position, left_units: u32, right_units: u32, limit: usize) ![]Position {
    _ = std.math.add(u32, left_units, right_units) catch return error.LimitExceeded;
    const count = std.math.add(usize, left.len, right.len) catch return error.LimitExceeded;
    if (count > limit) return error.LimitExceeded;
    try validate(a, left, left_units, limit);
    try validate(a, right, right_units, limit);
    const result = try a.alloc(Position, count);
    errdefer a.free(result);
    @memcpy(result[0..left.len], left);
    for (right, result[left.len..]) |position, *target| {
        target.* = try coordinates.mergeRight(position, left_units, right_units);
        target.affinity = coordinates.canonicalAffinity(target.unit);
    }
    try validate(a, result, left_units + right_units, limit);
    return result;
}

test "page area arrays partition both owners and merge canonical coordinates through allocation failures" {
    const a = std.testing.allocator;
    const source = [_]Position{
        .{ .source_element = 4, .source_control = 3, .unit = 0 },
        .{ .source_element = 8, .source_control = 7, .unit = 2, .affinity = .right },
        .{ .source_element = 12, .source_control = 11, .unit = 4, .affinity = .right },
    };
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, positions: []const Position) !void {
            for (0..7) |cut| {
                var parts = try split(allocator, positions, @intCast(cut), @intCast(cut), 6, 3);
                defer parts.deinit(allocator);
                const joined = try merge(allocator, parts.left, parts.right, @intCast(cut), @intCast(6 - cut), 3);
                defer allocator.free(joined);
                try std.testing.expectEqualSlices(Position, positions, joined);
            }
        }
    };
    try Probe.run(a, &source);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&source});
    try std.testing.expectError(error.DuplicatePageAreaSource, merge(a, source[0..1], source[0..1], 0, 6, 3));
    try std.testing.expectError(error.ProtectedPageAreaBoundary, split(a, &source, 1, 3, 6, 3));
    try std.testing.expectError(error.InvalidTextPosition, split(a, &.{}, 1, 0, 0, 0));
    try std.testing.expectError(error.LimitExceeded, merge(a, &.{}, &.{}, std.math.maxInt(u32), 1, 0));
    try std.testing.expectError(error.LimitExceeded, split(a, &source, 0, 0, 6, 2));
}
