//! Column boundary coordinates only; XML and editing policy belong to callers.
const std = @import("std");

pub const Position = struct {
    source_element: usize,
    unit: u32,
    affinity: @import("zero_width_coordinate.zig").Affinity,
};

pub fn splice(position: Position, start: u32, end: u32, inserted_units: u32, text_units: u32) !Position {
    var result = position;
    result.unit = @import("zero_width_coordinate.zig").splice(position.unit, position.affinity, start, end, inserted_units, text_units) catch |err| return if (err == error.ProtectedMetadataBoundary) error.ProtectedColumnBoundary else err;
    return result;
}

pub const Partition = struct { right: bool, position: Position };
pub fn split(position: Position, at: u32, text_units: u32) !Partition {
    const part = try @import("zero_width_coordinate.zig").split(position.unit, position.affinity, at, text_units);
    var result = position;
    result.unit = part.unit;
    return .{ .right = part.right, .position = result };
}

test "column boundary coordinates preserve explicit affinity and source identity" {
    const p: Position = .{ .source_element = 42, .unit = 3, .affinity = .left };
    try std.testing.expectEqual(@as(u32, 5), (try splice(p, 1, 1, 2, 8)).unit);
    try std.testing.expectEqual(p, try splice(p, 5, 6, 0, 8));
    try std.testing.expectEqual(@as(u32, 2), (try splice(p, 1, 2, 0, 8)).unit);
    try std.testing.expectEqual(p, try splice(p, 3, 3, 2, 8));
    var r = p;
    r.affinity = .right;
    try std.testing.expectEqual(@as(u32, 5), (try splice(r, 3, 3, 2, 8)).unit);
    try std.testing.expectEqual(@as(usize, 42), (try splice(r, 3, 3, 2, 8)).source_element);
    try std.testing.expectError(error.ProtectedColumnBoundary, splice(p, 2, 4, 0, 8));
    try std.testing.expectError(error.InvalidTextPosition, splice(p, 4, 2, 0, 8));
    try std.testing.expectError(error.LimitExceeded, splice(p, 0, 0, std.math.maxInt(u32), 8));
    try std.testing.expect(!(try split(p, 3, 8)).right);
    const partition = try split(r, 3, 8);
    try std.testing.expect(partition.right);
    try std.testing.expectEqual(@as(u32, 0), partition.position.unit);
    try std.testing.expectEqual(@as(usize, 42), partition.position.source_element);
    try std.testing.expectError(error.InvalidTextPosition, split(p, 9, 8));
}

test "column boundary coordinates exhaust small splice and split domains" {
    for (0..9) |length| {
        const text_units: u32 = @intCast(length);
        for (0..length + 1) |boundary| {
            for ([_]@TypeOf(@as(Position, undefined).affinity){ .left, .right }) |affinity| {
                const original: Position = .{ .source_element = 123, .unit = @intCast(boundary), .affinity = affinity };
                for (0..length + 1) |start| {
                    for (start..length + 1) |end| {
                        for (0..5) |inserted| {
                            if (start < boundary and boundary < end) {
                                try std.testing.expectError(error.ProtectedColumnBoundary, splice(original, @intCast(start), @intCast(end), @intCast(inserted), text_units));
                                continue;
                            }
                            const actual = try splice(original, @intCast(start), @intCast(end), @intCast(inserted), text_units);
                            const expected = if (boundary < start or (boundary == start and affinity == .left))
                                boundary
                            else if (boundary <= end)
                                start + inserted
                            else
                                boundary - (end - start) + inserted;
                            try std.testing.expectEqual(@as(u32, @intCast(expected)), actual.unit);
                            try std.testing.expect(actual.unit <= length - (end - start) + inserted);
                            try std.testing.expectEqual(original.source_element, actual.source_element);
                            try std.testing.expectEqual(original.affinity, actual.affinity);
                        }
                    }
                    const partition = try split(original, @intCast(start), text_units);
                    try std.testing.expectEqual(boundary > start or (boundary == start and affinity == .right), partition.right);
                    const reconstructed = partition.position.unit + if (partition.right) @as(u32, @intCast(start)) else 0;
                    try std.testing.expectEqual(original.unit, reconstructed);
                    try std.testing.expectEqual(original.source_element, partition.position.source_element);
                    try std.testing.expectEqual(original.affinity, partition.position.affinity);
                    try std.testing.expect(partition.position.unit <= if (partition.right) length - start else start);
                }
            }
        }
    }
}

test "column boundary coordinates validate empty and maximum length documents" {
    const maximum = std.math.maxInt(u32);
    const edge: Position = .{ .source_element = std.math.maxInt(usize), .unit = maximum, .affinity = .right };
    try std.testing.expectEqual(edge, try splice(edge, maximum, maximum, 0, maximum));
    try std.testing.expectError(error.LimitExceeded, splice(edge, maximum, maximum, 1, maximum));
    try std.testing.expectEqual(@as(u32, 0), (try splice(edge, 0, maximum, 0, maximum)).unit);
    try std.testing.expectEqual(edge, try splice(edge, 0, maximum, maximum, maximum));
    const part = try split(edge, maximum, maximum);
    try std.testing.expect(part.right);
    try std.testing.expectEqual(@as(u32, 0), part.position.unit);
    var outside = edge;
    outside.unit = 1;
    try std.testing.expectError(error.InvalidTextPosition, splice(outside, 0, 0, 0, 0));
    try std.testing.expectError(error.InvalidTextPosition, split(outside, 0, 0));
    outside.unit = 0;
    try std.testing.expectEqual(outside, try splice(outside, 0, 0, 0, 0));
    try std.testing.expect((try split(outside, 0, 0)).right);
}
