const std = @import("std");
const binary = @import("../../binary/reader.zig");
const argb = @import("emf_plus_argb.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const object = @import("emf_plus_object.zig");
const values = @import("emf_plus_image_attributes_values.zig");
const wrap_mode_values = @import("emf_plus_wrap_mode.zig");

pub const wire_size: usize = 24;

pub const ImageAttributes = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    reserved_1: u32,
    wrap_mode: wrap_mode_values.WrapMode,
    clamp_color: argb.Argb,
    object_clamp: values.ObjectClamp,
    reserved_2: u32,
};

pub fn parse(bytes: []const u8) !ImageAttributes {
    if (bytes.len < wire_size) return error.UnexpectedEnd;
    if (bytes.len > wire_size) return error.InvalidEmfPlusImageAttributesSize;
    var reader: binary.Reader = .{ .bytes = bytes };
    return .{
        .bytes = bytes,
        .version = try graphics_version.parse(try reader.readInt(u32)),
        .reserved_1 = try reader.readInt(u32),
        .wrap_mode = try wrap_mode_values.WrapMode.parse(try reader.readInt(u32)),
        .clamp_color = try argb.read(&reader),
        .object_clamp = try values.ObjectClamp.parse(try reader.readInt(i32)),
        .reserved_2 = try reader.readInt(u32),
    };
}

pub fn parseCompleted(value: object.Completed) !ImageAttributes {
    if (value.object_type != .image_attributes) return error.NotEmfPlusImageAttributesObject;
    return parse(value.object_data);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    std.mem.writeInt(i32, bytes[offset..][0..4], value, .little);
}

test "EMF+ ImageAttributes preserves every field including ignored reserved values" {
    var bytes = [_]u8{0} ** wire_size;
    putU32(&bytes, 0, 0xdbc01abc);
    putU32(&bytes, 4, 0xdead_beef);
    putU32(&bytes, 8, 3);
    putU32(&bytes, 12, 0x4433_2211);
    putI32(&bytes, 16, 1);
    putU32(&bytes, 20, 0x89ab_cdef);
    const value = try parse(&bytes);
    try std.testing.expectEqual(@as(u12, 0xabc), value.version.version);
    try std.testing.expectEqual(@as(u32, 0xdead_beef), value.reserved_1);
    try std.testing.expectEqual(wrap_mode_values.WrapMode.tile_flip_xy, value.wrap_mode);
    try std.testing.expectEqual(@as(u32, 0x4433_2211), value.clamp_color.raw());
    try std.testing.expectEqual(@as(u8, 0x44), value.clamp_color.alpha);
    try std.testing.expectEqual(values.ObjectClamp.bitmap, value.object_clamp);
    try std.testing.expectEqual(@as(u32, 0x89ab_cdef), value.reserved_2);
    try std.testing.expectEqualSlices(u8, &bytes, value.bytes);
}

test "EMF+ ImageAttributes accepts every WrapMode and ObjectClamp combination" {
    var bytes = [_]u8{0} ** wire_size;
    putU32(&bytes, 0, 0xdbc01001);
    inline for (0..5) |raw_wrap| {
        inline for (0..2) |raw_clamp| {
            putU32(&bytes, 8, raw_wrap);
            putI32(&bytes, 16, raw_clamp);
            const value = try parse(&bytes);
            try std.testing.expectEqual(@as(u32, raw_wrap), @intFromEnum(value.wrap_mode));
            try std.testing.expectEqual(@as(i32, raw_clamp), @intFromEnum(value.object_clamp));
        }
    }
}

test "EMF+ ImageAttributes preserves ClampColor independently of WrapMode" {
    var bytes = [_]u8{0} ** wire_size;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 8, 0);
    putU32(&bytes, 12, 0xa1b2_c3d4);
    const value = try parse(&bytes);
    try std.testing.expectEqual(wrap_mode_values.WrapMode.tile, value.wrap_mode);
    try std.testing.expectEqual(@as(u32, 0xa1b2_c3d4), value.clamp_color.raw());
}

test "EMF+ ImageAttributes rejects every truncation trailing data domains and wrong object type" {
    var bytes = [_]u8{0} ** wire_size;
    putU32(&bytes, 0, 0xdbc01001);
    for (0..wire_size) |cut|
        try std.testing.expectError(error.UnexpectedEnd, parse(bytes[0..cut]));
    var trailing = [_]u8{0} ** (wire_size + 1);
    @memcpy(trailing[0..wire_size], &bytes);
    try std.testing.expectError(error.InvalidEmfPlusImageAttributesSize, parse(&trailing));
    var invalid = bytes;
    putU32(&invalid, 0, 0xdbc00001);
    try std.testing.expectError(error.InvalidEmfPlusMetafileSignature, parse(&invalid));
    invalid = bytes;
    putU32(&invalid, 8, 5);
    try std.testing.expectError(error.InvalidEmfPlusWrapMode, parse(&invalid));
    invalid = bytes;
    putI32(&invalid, 16, -1);
    try std.testing.expectError(error.InvalidEmfPlusObjectClamp, parse(&invalid));
    putI32(&invalid, 16, 2);
    try std.testing.expectError(error.InvalidEmfPlusObjectClamp, parse(&invalid));
    try std.testing.expectError(error.NotEmfPlusImageAttributesObject, parseCompleted(.{ .object_id = 0, .object_type = .font, .object_data = &bytes, .multipart = false }));
    _ = try parseCompleted(.{ .object_id = 0, .object_type = .image_attributes, .object_data = &bytes, .multipart = false });
}
