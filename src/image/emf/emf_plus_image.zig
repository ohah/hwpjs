const std = @import("std");
const binary = @import("../../binary/reader.zig");
const bitmap = @import("emf_plus_bitmap.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const metafile = @import("emf_plus_metafile.zig");
const object = @import("emf_plus_object.zig");
const values = @import("emf_plus_image_values.zig");

pub const Options = struct {
    max_image_bytes: usize = 64 * 1024 * 1024,
    max_palette_entries: u32 = 1 << 20,
};

pub const Data = union(values.ImageDataType) {
    unknown: []const u8,
    bitmap: bitmap.Bitmap,
    metafile: metafile.Metafile,
};

pub const Image = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    data: Data,
};

pub fn parse(bytes: []const u8, options: Options) !Image {
    if (bytes.len > options.max_image_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const version = try graphics_version.parse(try reader.readInt(u32));
    const data_type = try values.imageDataType(try reader.readInt(u32));
    const payload = bytes[reader.offset..];
    const data: Data = switch (data_type) {
        .unknown => .{ .unknown = payload },
        .bitmap => .{ .bitmap = try bitmap.parse(payload, .{
            .max_data_bytes = options.max_image_bytes - reader.offset,
            .max_palette_entries = options.max_palette_entries,
        }) },
        .metafile => .{ .metafile = try metafile.parse(payload, .{
            .max_data_bytes = options.max_image_bytes - reader.offset,
        }) },
    };
    return .{ .bytes = bytes, .version = version, .data = data };
}

pub fn parseCompleted(value: object.Completed, options: Options) !Image {
    if (value.object_type != .image) return error.NotEmfPlusImageObject;
    return parse(value.object_data, options);
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    std.mem.writeInt(i32, bytes[offset..][0..4], value, .little);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

test "EMF+ Image dispatches unknown bitmap and metafile without guessing payload formats" {
    var unknown = [_]u8{0} ** 11;
    putU32(&unknown, 0, 0xdbc01002);
    unknown[8..11].* = .{ 0xde, 0xad, 0xbe };
    const unknown_value = try parse(&unknown, .{});
    try std.testing.expectEqualSlices(u8, &.{ 0xde, 0xad, 0xbe }, unknown_value.data.unknown);

    var raw = [_]u8{0} ** 32;
    putU32(&raw, 0, 0xdbc01001);
    putU32(&raw, 4, 1);
    putI32(&raw, 8, 1);
    putI32(&raw, 12, 1);
    putI32(&raw, 16, 4);
    putU32(&raw, 20, 0x0026200a);
    raw[28..32].* = .{ 1, 2, 3, 4 };
    const raw_value = try parse(&raw, .{});
    try std.testing.expectEqual(values.PixelFormat.argb_32bpp, raw_value.data.bitmap.data.pixel.format);
    try std.testing.expectEqualSlices(u8, raw[28..32], raw_value.data.bitmap.data.pixel.bytes);

    var meta = [_]u8{0} ** 20;
    putU32(&meta, 0, 0xdbc01001);
    putU32(&meta, 4, 2);
    putU32(&meta, 8, 3);
    putU32(&meta, 12, 3);
    meta[16..20].* = .{ 1, 2, 3, 0xaa };
    const meta_value = try parse(&meta, .{});
    try std.testing.expectEqualSlices(u8, &.{ 1, 2, 3 }, meta_value.data.metafile.data);
    try std.testing.expectEqualSlices(u8, &.{0xaa}, meta_value.data.metafile.alignment_padding);
}

test "EMF+ Image rejects every envelope truncation unknown enum limit and wrong completed object" {
    var bytes = [_]u8{0} ** 8;
    putU32(&bytes, 0, 0xdbc01001);
    for (0..8) |cut| try std.testing.expectError(error.UnexpectedEnd, parse(bytes[0..cut], .{}));
    var invalid = bytes;
    putU32(&invalid, 4, 3);
    try std.testing.expectError(error.InvalidEmfPlusImageDataType, parse(&invalid, .{}));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_image_bytes = 7 }));
    try std.testing.expectError(error.NotEmfPlusImageObject, parseCompleted(.{
        .object_id = 1,
        .object_type = .path,
        .object_data = &bytes,
        .multipart = false,
    }, .{}));
    _ = try parseCompleted(.{
        .object_id = 1,
        .object_type = .image,
        .object_data = &bytes,
        .multipart = false,
    }, .{});
}
