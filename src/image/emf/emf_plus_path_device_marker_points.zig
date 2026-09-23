const device_commands = @import("emf_plus_path_device_commands.zig");

pub const Role = enum {
    move,
    line_endpoint,
    bezier_control1,
    bezier_control2,
    bezier_endpoint,
};

pub const Marker = struct {
    figure_index: usize,
    source_point_index: usize,
    figure_point_index: usize,
    role: Role,
    point: device_commands.TypedPoint,
};

const Selected = struct {
    role: Role,
    point: device_commands.TypedPoint,
};

pub const Iterator = struct {
    source: device_commands.Iterator,
    pending_command: ?device_commands.Command = null,
    pending_offset: u2 = 0,
    figure_count: usize = 0,
    source_point_index: usize = 0,
    figure_point_index: usize = 0,

    pub fn next(self: *Iterator) !?Marker {
        var pending = self.*;
        while (true) {
            if (pending.pending_command == null) {
                pending.pending_command = try pending.source.next() orelse {
                    self.* = pending;
                    return null;
                };
                pending.pending_offset = 0;
            }

            const command = pending.pending_command.?;
            const selected = selectPoint(command, pending.pending_offset);
            if (command == .move_to) {
                pending.figure_count += 1;
                pending.figure_point_index = 0;
            } else if (pending.figure_count == 0) {
                return error.InvalidEmfPlusPathDeviceMarkerSequence;
            }
            const marker: Marker = .{
                .figure_index = pending.figure_count - 1,
                .source_point_index = pending.source_point_index,
                .figure_point_index = pending.figure_point_index,
                .role = selected.role,
                .point = selected.point,
            };
            pending.source_point_index += 1;
            pending.figure_point_index += 1;
            pending.pending_offset += 1;
            if (pending.pending_offset == command.sourcePointCount()) {
                pending.pending_command = null;
                pending.pending_offset = 0;
            }
            if (selected.point.point_type.point_type.path_marker) {
                self.* = pending;
                return marker;
            }
        }
    }
};

pub fn fromCommands(source: device_commands.Iterator) Iterator {
    return .{ .source = source };
}

fn selectPoint(command: device_commands.Command, offset: u2) Selected {
    return switch (command) {
        .move_to => |move| .{ .role = .move, .point = move },
        .line_to => |line| .{ .role = .line_endpoint, .point = line.end },
        .bezier_to => |bezier| switch (offset) {
            0 => .{ .role = .bezier_control1, .point = bezier.control1 },
            1 => .{ .role = .bezier_control2, .point = bezier.control2 },
            2 => .{ .role = .bezier_endpoint, .point = bezier.end },
            else => unreachable,
        },
    };
}

const std = @import("std");
const page_transform = @import("emf_plus_page_transform.zig");
const path_geometry = @import("emf_plus_path_geometry.zig");
const path_type = @import("emf_plus_path_type.zig");
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

fn points(values: []const i16, output: []u8) void {
    for (values, 0..) |coordinate, index|
        std.mem.writeInt(i16, output[index * 2 ..][0..2], coordinate, .little);
}

test "EMF+ Path device marker points keep control point roles indexes and metadata" {
    var point_bytes: [9 * 4]u8 = undefined;
    points(&.{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 }, &point_bytes);
    const types = [_]u8{ 0x20, 0x31, 0x33, 0x23, 0xa3, 0xa0, 0x00, 0x01, 0x21 };
    var iterator = fromCommands(commandIterator(&point_bytes, &types, 9));

    const expected = [_]struct { figure: usize, source: usize, local: usize, role: Role, x: f32, y: f32, raw: u8 }{
        .{ .figure = 0, .source = 0, .local = 0, .role = .move, .x = 22, .y = 44, .raw = 0x20 },
        .{ .figure = 0, .source = 1, .local = 1, .role = .line_endpoint, .x = 26, .y = 48, .raw = 0x31 },
        .{ .figure = 0, .source = 2, .local = 2, .role = .bezier_control1, .x = 30, .y = 52, .raw = 0x33 },
        .{ .figure = 0, .source = 3, .local = 3, .role = .bezier_control2, .x = 34, .y = 56, .raw = 0x23 },
        .{ .figure = 0, .source = 4, .local = 4, .role = .bezier_endpoint, .x = 38, .y = 60, .raw = 0xa3 },
        .{ .figure = 1, .source = 5, .local = 0, .role = .move, .x = 42, .y = 64, .raw = 0xa0 },
        .{ .figure = 2, .source = 8, .local = 2, .role = .line_endpoint, .x = 54, .y = 76, .raw = 0x21 },
    };
    for (expected) |want| {
        const maybe_marker = try iterator.next();
        try std.testing.expect(maybe_marker != null);
        const marker = maybe_marker.?;
        try std.testing.expectEqual(want.figure, marker.figure_index);
        try std.testing.expectEqual(want.source, marker.source_point_index);
        try std.testing.expectEqual(want.local, marker.figure_point_index);
        try std.testing.expectEqual(want.role, marker.role);
        try std.testing.expectEqual(want.x, marker.point.value.x);
        try std.testing.expectEqual(want.y, marker.point.value.y);
        try std.testing.expectEqual(want.raw, marker.point.point_type.point_type.raw);
    }
    try std.testing.expect((try iterator.next()) == null);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Path device marker points preserve errors and progress atomically" {
    var point_bytes: [5 * 4]u8 = undefined;
    points(&.{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 }, &point_bytes);
    const types = [_]u8{ 0x20, 0x01, 0x13, 0x23, 0x00 };
    var iterator = fromCommands(commandIterator(&point_bytes, &types, 5));
    const maybe_first = try iterator.next();
    try std.testing.expect(maybe_first != null);
    try std.testing.expectEqual(@as(usize, 0), maybe_first.?.source_point_index);
    const before = iterator;
    try std.testing.expectError(error.InvalidEmfPlusPathBezierSequence, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
    try std.testing.expectError(error.InvalidEmfPlusPathBezierSequence, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);

    var no_markers = fromCommands(commandIterator(point_bytes[0..8], &.{ 0x00, 0x01 }, 2));
    try std.testing.expect((try no_markers.next()) == null);
    try std.testing.expectEqual(@as(usize, 2), no_markers.source_point_index);
    try std.testing.expect((try no_markers.next()) == null);
}
