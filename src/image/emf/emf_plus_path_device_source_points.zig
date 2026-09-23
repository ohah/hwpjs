const device_commands = @import("emf_plus_path_device_commands.zig");

pub const Role = enum {
    move,
    line_endpoint,
    bezier_control1,
    bezier_control2,
    bezier_endpoint,
};

pub const SourcePoint = struct {
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

    pub fn next(self: *Iterator) !?SourcePoint {
        var pending = self.*;
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
            return error.InvalidEmfPlusPathDeviceSourcePointSequence;
        }
        const result: SourcePoint = .{
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
        self.* = pending;
        return result;
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

test "EMF+ Path device source points retain all original roles and indexes" {
    var point_bytes: [6 * 4]u8 = undefined;
    const coordinates = [_]i16{ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
    for (coordinates, 0..) |coordinate, index|
        std.mem.writeInt(i16, point_bytes[index * 2 ..][0..2], coordinate, .little);
    const types = [_]u8{ 0x00, 0x11, 0x33, 0x13, 0x83, 0x10 };
    var iterator = fromCommands(commandIterator(&point_bytes, &types, 6));
    const expected_roles = [_]Role{ .move, .line_endpoint, .bezier_control1, .bezier_control2, .bezier_endpoint, .move };
    for (expected_roles, 0..) |role, index| {
        const maybe_value = try iterator.next();
        try std.testing.expect(maybe_value != null);
        const value = maybe_value.?;
        try std.testing.expectEqual(role, value.role);
        try std.testing.expectEqual(index, value.source_point_index);
        try std.testing.expectEqual(if (index == 5) @as(usize, 1) else 0, value.figure_index);
        try std.testing.expectEqual(if (index == 5) @as(usize, 0) else index, value.figure_point_index);
        try std.testing.expectEqual(types[index], value.point.point_type.point_type.raw);
        try std.testing.expectEqual(@as(f32, @floatFromInt(coordinates[index * 2] * 2 + 20)), value.point.value.x);
        try std.testing.expectEqual(@as(f32, @floatFromInt(coordinates[index * 2 + 1] * 2 + 40)), value.point.value.y);
    }
    try std.testing.expect((try iterator.next()) == null);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ Path device source points keep progress atomic on malformed Bezier" {
    const point_bytes = [_]u8{0} ** (5 * 4);
    const types = [_]u8{ 0x00, 0x01, 0x03, 0x01, 0x00 };
    var iterator = fromCommands(commandIterator(&point_bytes, &types, 5));
    _ = (try iterator.next()).?;
    _ = (try iterator.next()).?;
    const before = iterator;
    try std.testing.expectError(error.InvalidEmfPlusPathBezierSequence, iterator.next());
    try std.testing.expectEqualDeep(before, iterator);
    try std.testing.expectError(error.InvalidEmfPlusPathBezierSequence, iterator.next());
}
