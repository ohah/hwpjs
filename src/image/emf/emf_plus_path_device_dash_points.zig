const device_commands = @import("emf_plus_path_device_commands.zig");
const source_points = @import("emf_plus_path_device_source_points.zig");

pub const Role = source_points.Role;
pub const DashPoint = source_points.SourcePoint;

pub const Iterator = struct {
    source: source_points.Iterator,

    pub fn next(self: *Iterator) !?DashPoint {
        var pending = self.*;
        while (true) {
            const value = try pending.source.next() orelse {
                self.* = pending;
                return null;
            };
            if (value.point.point_type.point_type.dash_mode) {
                self.* = pending;
                return value;
            }
        }
    }
};

pub fn fromCommands(source: device_commands.Iterator) Iterator {
    return .{ .source = source_points.fromCommands(source) };
}

const std = @import("std");
const page_transform = @import("emf_plus_page_transform.zig");
const path_geometry = @import("emf_plus_path_geometry.zig");
const point = @import("emf_plus_point.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const world_page_device = @import("emf_plus_world_page_device.zig");

fn commandIterator(point_bytes: []const u8, type_bytes: []const u8, count: u32) device_commands.Iterator {
    const commands = path_geometry.commands(
        .{ .reader = .{ .bytes = point_bytes }, .encoding = point.Encoding.integer, .remaining = count },
        .{ .reader = .{ .bytes = type_bytes }, .rle = false, .remaining = count },
    );
    const mapping = world_page_device.resolve(transform_matrix.TransformMatrix.translation(10, 20), page_transform.build(.pixel, 2, .{ .x = 96, .y = 96 })).?;
    return device_commands.fromCommands(commands, mapping);
}

test "EMF+ Path device dash flag points retain original control roles and figure indexes" {
    var point_bytes: [9 * 4]u8 = undefined;
    const coordinates = [_]i16{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 };
    for (coordinates, 0..) |coordinate, index|
        std.mem.writeInt(i16, point_bytes[index * 2 ..][0..2], coordinate, .little);
    const types = [_]u8{ 0x10, 0x21, 0x13, 0x23, 0x93, 0x90, 0x00, 0x01, 0x11 };
    var iterator = fromCommands(commandIterator(&point_bytes, &types, 9));
    const expected = [_]struct { source: usize, figure: usize, local: usize, role: Role, raw: u8 }{
        .{ .source = 0, .figure = 0, .local = 0, .role = .move, .raw = 0x10 },
        .{ .source = 2, .figure = 0, .local = 2, .role = .bezier_control1, .raw = 0x13 },
        .{ .source = 4, .figure = 0, .local = 4, .role = .bezier_endpoint, .raw = 0x93 },
        .{ .source = 5, .figure = 1, .local = 0, .role = .move, .raw = 0x90 },
        .{ .source = 8, .figure = 2, .local = 2, .role = .line_endpoint, .raw = 0x11 },
    };
    for (expected) |want| {
        const maybe_value = try iterator.next();
        try std.testing.expect(maybe_value != null);
        const value = maybe_value.?;
        try std.testing.expectEqual(want.source, value.source_point_index);
        try std.testing.expectEqual(want.figure, value.figure_index);
        try std.testing.expectEqual(want.local, value.figure_point_index);
        try std.testing.expectEqual(want.role, value.role);
        try std.testing.expectEqual(want.raw, value.point.point_type.point_type.raw);
        try std.testing.expectEqual(@as(f32, @floatFromInt(coordinates[want.source * 2] * 2 + 20)), value.point.value.x);
        try std.testing.expectEqual(@as(f32, @floatFromInt(coordinates[want.source * 2 + 1] * 2 + 40)), value.point.value.y);
    }
    try std.testing.expect((try iterator.next()) == null);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Path device dash flag iterator preserves error state after unmatched points" {
    const point_bytes = [_]u8{0} ** (5 * 4);
    const types = [_]u8{ 0x10, 0x01, 0x03, 0x01, 0x00 };
    var iterator = fromCommands(commandIterator(&point_bytes, &types, 5));
    const first = (try iterator.next()).?;
    try std.testing.expectEqual(@as(usize, 0), first.source_point_index);
    const before = iterator;
    try std.testing.expectError(error.InvalidEmfPlusPathBezierSequence, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
    try std.testing.expectError(error.InvalidEmfPlusPathBezierSequence, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);

    var no_flags = fromCommands(commandIterator(point_bytes[0..8], &.{ 0x00, 0x01 }, 2));
    try std.testing.expect((try no_flags.next()) == null);
    try std.testing.expectEqual(@as(usize, 2), no_flags.source.source_point_index);
}
