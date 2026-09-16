const std = @import("std");
const binary = @import("../../binary/reader.zig");
const brush_values = @import("emf_plus_brush_values.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const linear = @import("emf_plus_linear_gradient_brush.zig");
const object = @import("emf_plus_object.zig");
const path_gradient = @import("emf_plus_path_gradient_brush.zig");
const simple = @import("emf_plus_simple_brush.zig");
const texture = @import("emf_plus_texture_brush.zig");

pub const Options = struct {
    max_brush_bytes: usize = 64 * 1024 * 1024,
    path_gradient_options: path_gradient.Options = .{},
    texture_options: texture.Options = .{},
};

pub const Data = union(brush_values.BrushType) {
    solid_color: simple.Solid,
    hatch_fill: simple.Hatch,
    texture_fill: texture.Texture,
    path_gradient: path_gradient.PathGradient,
    linear_gradient: linear.LinearGradient,
};

pub const Brush = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    data: Data,
};

pub fn parse(bytes: []const u8, options: Options) !Brush {
    if (bytes.len > options.max_brush_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const version = try graphics_version.parse(try reader.readInt(u32));
    const brush_type = try brush_values.brushType(try reader.readInt(u32));
    const payload = bytes[reader.offset..];
    const data: Data = switch (brush_type) {
        .solid_color => .{ .solid_color = try simple.parseSolid(payload) },
        .hatch_fill => .{ .hatch_fill = try simple.parseHatch(payload) },
        .texture_fill => .{ .texture_fill = try texture.parse(payload, options.texture_options) },
        .path_gradient => .{ .path_gradient = try path_gradient.parse(payload, options.path_gradient_options) },
        .linear_gradient => .{ .linear_gradient = try linear.parse(payload) },
    };
    return .{ .bytes = bytes, .version = version, .data = data };
}

pub fn parseCompleted(value: object.Completed, options: Options) !Brush {
    if (value.object_type != .brush) return error.NotEmfPlusBrushObject;
    return parse(value.object_data, options);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

test "EMF+ Brush dispatches all five official brush types" {
    var solid = [_]u8{0} ** 12;
    putU32(&solid, 0, 0xdbc01001);
    putU32(&solid, 8, 0xff010203);
    try std.testing.expectEqual(@as(u32, 0xff010203), (try parse(&solid, .{})).data.solid_color.color.raw());

    var hatch = [_]u8{0} ** 20;
    putU32(&hatch, 0, 0xdbc01001);
    putU32(&hatch, 4, 1);
    putU32(&hatch, 8, 0x34);
    try std.testing.expectEqual(brush_values.HatchStyle.solid_diamond, (try parse(&hatch, .{})).data.hatch_fill.style);

    var texture_bytes = [_]u8{0} ** 16;
    putU32(&texture_bytes, 0, 0xdbc01001);
    putU32(&texture_bytes, 4, 2);
    try std.testing.expect((try parse(&texture_bytes, .{})).data.texture_fill.image_object == null);

    var path_bytes = [_]u8{0} ** 36;
    putU32(&path_bytes, 0, 0xdbc01001);
    putU32(&path_bytes, 4, 3);
    try std.testing.expectEqual(@as(u32, 0), (try parse(&path_bytes, .{})).data.path_gradient.boundary.points.count);

    var linear_bytes = [_]u8{0} ** 48;
    putU32(&linear_bytes, 0, 0xdbc01001);
    putU32(&linear_bytes, 4, 4);
    try std.testing.expectEqual(brush_values.WrapMode.tile, (try parse(&linear_bytes, .{})).data.linear_gradient.wrap_mode);
}

test "EMF+ Brush rejects every envelope truncation type limit and wrong completed object" {
    var bytes = [_]u8{0} ** 12;
    putU32(&bytes, 0, 0xdbc01001);
    for (0..8) |cut| try expectError(bytes[0..cut], .{});
    putU32(&bytes, 4, 5);
    try std.testing.expectError(error.InvalidEmfPlusBrushType, parse(&bytes, .{}));
    putU32(&bytes, 4, 0);
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_brush_bytes = 11 }));
    try std.testing.expectError(error.NotEmfPlusBrushObject, parseCompleted(.{
        .object_id = 2,
        .object_type = .image,
        .object_data = &bytes,
        .multipart = false,
    }, .{}));
    _ = try parseCompleted(.{
        .object_id = 2,
        .object_type = .brush,
        .object_data = &bytes,
        .multipart = false,
    }, .{});
}

fn expectError(bytes: []const u8, options: Options) !void {
    if (parse(bytes, options)) |_| return error.TestExpectedError else |_| {}
}
