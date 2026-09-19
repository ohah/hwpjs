const std = @import("std");
const binary = @import("../../binary/reader.zig");
const brush = @import("emf_plus_brush.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const object = @import("emf_plus_object.zig");
const pen_data = @import("emf_plus_pen_data.zig");

pub const Options = struct {
    max_pen_bytes: usize = 64 * 1024 * 1024,
    pen_data_options: pen_data.Options = .{},
    brush_options: brush.Options = .{},
};

pub const Pen = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    data: pen_data.PenData,
    brush_object: brush.Brush,
};

pub fn parse(bytes: []const u8, options: Options) !Pen {
    if (bytes.len > options.max_pen_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const version = try graphics_version.parse(try reader.readInt(u32));
    if (try reader.readInt(u32) != 0) return error.InvalidEmfPlusPenType;
    const data = try pen_data.read(&reader, options.pen_data_options);
    const brush_object = try brush.parse(bytes[reader.offset..], options.brush_options);
    return .{ .bytes = bytes, .version = version, .data = data, .brush_object = brush_object };
}

pub fn parseCompleted(value: object.Completed, options: Options) !Pen {
    if (value.object_type != .pen) return error.NotEmfPlusPenObject;
    return parse(value.object_data, options);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

test "EMF+ Pen separates PenData from the trailing Brush object" {
    var bytes = [_]u8{0} ** 32;
    putU32(&bytes, 0, 0xdbc01002);
    putU32(&bytes, 8, 0);
    putU32(&bytes, 12, 6);
    putU32(&bytes, 16, @bitCast(@as(f32, 2)));
    putU32(&bytes, 20, 0xdbc01001);
    putU32(&bytes, 28, 0xff010203);
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(@as(f32, 2), value.data.width);
    try std.testing.expectEqual(@as(u32, 0xff010203), value.brush_object.data.solid_color.color.raw());
}

test "EMF+ Pen rejects type limit truncation missing brush and wrong completed type" {
    var bytes = [_]u8{0} ** 32;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 12, 0);
    putU32(&bytes, 20, 0xdbc01001);
    for (0..bytes.len) |cut| try expectError(bytes[0..cut], .{});
    putU32(&bytes, 4, 1);
    try std.testing.expectError(error.InvalidEmfPlusPenType, parse(&bytes, .{}));
    putU32(&bytes, 4, 0);
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_pen_bytes = 31 }));
    try std.testing.expectError(error.NotEmfPlusPenObject, parseCompleted(.{ .object_id = 1, .object_type = .brush, .object_data = &bytes, .multipart = false }, .{}));
    _ = try parseCompleted(.{ .object_id = 1, .object_type = .pen, .object_data = &bytes, .multipart = false }, .{});
}

fn expectError(bytes: []const u8, options: Options) !void {
    if (parse(bytes, options)) |_| return error.TestExpectedError else |_| {}
}
