const std = @import("std");
const binary = @import("../../binary/reader.zig");
const brush_values = @import("emf_plus_brush_values.zig");
const wrap_mode_values = @import("emf_plus_wrap_mode.zig");
const image = @import("emf_plus_image.zig");
const matrix = @import("emf_plus_transform_matrix.zig");

pub const Options = struct { image_options: image.Options = .{} };

pub const Texture = struct {
    bytes: []const u8,
    flags_raw: u32,
    wrap_mode: wrap_mode_values.WrapMode,
    transform: ?matrix.TransformMatrix,
    image_object: ?image.Image,
};

pub fn parse(bytes: []const u8, options: Options) !Texture {
    var reader: binary.Reader = .{ .bytes = bytes };
    const flags = try reader.readInt(u32);
    try brush_values.validateBrushDataFlags(flags);
    const wrap_mode = try wrap_mode_values.WrapMode.parse(try reader.readInt(u32));
    const transform = if (flags & 0x02 != 0) try matrix.read(&reader) else null;
    const image_object = if (reader.offset == bytes.len)
        null
    else
        try image.parse(bytes[reader.offset..], options.image_options);
    return .{
        .bytes = bytes,
        .flags_raw = flags,
        .wrap_mode = wrap_mode,
        .transform = transform,
        .image_object = image_object,
    };
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ texture brush parses transform then delegates optional Image" {
    var bytes = [_]u8{0} ** 43;
    // Keep gamma_corrected clear so this fixture independently proves that
    // transform presence is controlled by BrushDataTransform alone.
    putU32(&bytes, 0, 0x102);
    putU32(&bytes, 4, 2);
    for (0..6) |index| putF32(&bytes, 8 + index * 4, @floatFromInt(index + 1));
    putU32(&bytes, 32, 0xdbc01002);
    bytes[40..43].* = .{ 1, 2, 3 };
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(wrap_mode_values.WrapMode.tile_flip_y, value.wrap_mode);
    try std.testing.expectEqual(@as(f32, 6), value.transform.?.dy);
    try std.testing.expect(value.image_object != null);
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3 }, value.image_object.?.data.unknown);
}

test "EMF+ texture brush permits absent Image and rejects bad flags wrap truncation and image limit" {
    var bytes = [_]u8{0} ** 8;
    _ = try parse(&bytes, .{});
    for (0..8) |cut| try expectError(bytes[0..cut], .{});
    var invalid = bytes;
    putU32(&invalid, 0, 1);
    _ = try parse(&invalid, .{});
    putU32(&invalid, 0, 0x20);
    try std.testing.expectError(error.InvalidEmfPlusBrushDataFlags, parse(&invalid, .{}));
    invalid = bytes;
    putU32(&invalid, 4, 5);
    try std.testing.expectError(error.InvalidEmfPlusWrapMode, parse(&invalid, .{}));
    var image_bytes = [_]u8{0} ** 16;
    putU32(&image_bytes, 8, 0xdbc01001);
    try std.testing.expectError(error.LimitExceeded, parse(&image_bytes, .{ .image_options = .{ .max_image_bytes = 7 } }));
}

fn expectError(bytes: []const u8, options: Options) !void {
    if (parse(bytes, options)) |_| return error.TestExpectedError else |_| {}
}
