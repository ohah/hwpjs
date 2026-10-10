//! 쪽 영역 선언의 편집 좌표와 원본 identity입니다. 컨테이너/XML은 소유하지 않습니다.
const std = @import("std");
const coordinates = @import("zero_width_coordinate.zig");
pub const Position = struct {
    source_element: usize,
    source_control: usize,
    unit: u32,
    affinity: coordinates.Affinity = .left,
};

/// 저장 XML의 기본 입력 귀속과 일치하는 모델 정책입니다.
pub fn canonicalAffinity(unit: u32) coordinates.Affinity {
    return if (unit == 0) .left else .right;
}

pub fn splice(position: Position, start: u32, end: u32, inserted: u32, length: u32) !Position {
    var result = position;
    result.unit = coordinates.splice(position.unit, position.affinity, start, end, inserted, length) catch |err| return if (err == error.ProtectedMetadataBoundary) error.ProtectedPageAreaBoundary else err;
    return result;
}

pub const Partition = struct { right: bool, position: Position };
pub fn mergeRight(position: Position, left_units: u32, right_units: u32) !Position {
    if (position.unit > right_units) return error.InvalidTextPosition;
    _ = std.math.add(u32, left_units, right_units) catch return error.LimitExceeded;
    var result = position;
    result.unit = std.math.add(u32, left_units, position.unit) catch return error.LimitExceeded;
    return result;
}

pub fn split(position: Position, at: u32, length: u32) !Partition {
    const part = try coordinates.split(position.unit, position.affinity, at, length);
    var result = position;
    result.unit = part.unit;
    return .{ .right = part.right, .position = result };
}

test "page area position splice and split preserve owner identity and affinity" {
    for (0..7) |length| for (0..length + 1) |unit| for ([_]coordinates.Affinity{ .left, .right }) |affinity| {
        const position: Position = .{ .source_element = 13, .source_control = 11, .unit = @intCast(unit), .affinity = affinity };
        for (0..length + 1) |start| {
            const part = try split(position, @intCast(start), @intCast(length));
            try std.testing.expectEqual(unit > start or (unit == start and affinity == .right), part.right);
            try std.testing.expectEqual(position.unit, part.position.unit + if (part.right) @as(u32, @intCast(start)) else 0);
            try std.testing.expectEqual(position.source_element, part.position.source_element);
            try std.testing.expectEqual(position.source_control, part.position.source_control);
            for (start..length + 1) |end| for (0..4) |inserted| {
                if (start < unit and unit < end) {
                    try std.testing.expectError(error.ProtectedPageAreaBoundary, splice(position, @intCast(start), @intCast(end), @intCast(inserted), @intCast(length)));
                    continue;
                }
                const result = try splice(position, @intCast(start), @intCast(end), @intCast(inserted), @intCast(length));
                const expected = if (unit < start or (unit == start and affinity == .left)) unit else if (unit <= end) start + inserted else unit - (end - start) + inserted;
                try std.testing.expectEqual(@as(u32, @intCast(expected)), result.unit);
                try std.testing.expectEqual(position.source_element, result.source_element);
                try std.testing.expectEqual(position.source_control, result.source_control);
                try std.testing.expectEqual(position.affinity, result.affinity);
            };
        }
    };
    const edge: Position = .{ .source_element = 1, .source_control = 2, .unit = std.math.maxInt(u32) };
    try std.testing.expectError(error.LimitExceeded, splice(edge, 0, 0, 1, std.math.maxInt(u32)));
    try std.testing.expectError(error.InvalidTextPosition, split(edge, 0, 0));
    const seam: Position = .{ .source_element = 7, .source_control = 6, .unit = 0, .affinity = .right };
    const merged = try mergeRight(seam, 5, 3);
    try std.testing.expectEqual(@as(u32, 5), merged.unit);
    try std.testing.expectEqual(seam.source_control, merged.source_control);
    try std.testing.expectEqual(seam.source_element, merged.source_element);
    try std.testing.expectEqual(seam, (try split(merged, 5, 8)).position);
    try std.testing.expectError(error.LimitExceeded, mergeRight(seam, std.math.maxInt(u32), 1));
    try std.testing.expectError(error.InvalidTextPosition, mergeRight(edge, 0, 0));
}
