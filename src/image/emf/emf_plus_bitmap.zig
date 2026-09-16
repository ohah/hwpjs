const std = @import("std");
const binary = @import("../../binary/reader.zig");
const palette = @import("emf_plus_palette.zig");
const values = @import("emf_plus_image_values.zig");

pub const Options = struct {
    max_data_bytes: usize = 64 * 1024 * 1024,
    max_palette_entries: u32 = 1 << 20,
};

pub const PixelData = struct {
    format: values.PixelFormat,
    palette: ?palette.Palette,
    bytes: []const u8,
    alignment_padding: []const u8,
};

pub const CompressedData = struct {
    pixel_format_raw: u32,
    bytes: []const u8,
};

pub const Data = union(values.BitmapDataType) {
    pixel: PixelData,
    compressed: CompressedData,
};

pub const Bitmap = struct {
    bytes: []const u8,
    width: i32,
    height: i32,
    stride: i32,
    data: Data,
};

pub fn parse(bytes: []const u8, options: Options) !Bitmap {
    if (bytes.len > options.max_data_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const width = try reader.readInt(i32);
    const height = try reader.readInt(i32);
    const stride = try reader.readInt(i32);
    const pixel_format_raw = try reader.readInt(u32);
    const data_type = try values.bitmapDataType(try reader.readInt(u32));
    const data: Data = switch (data_type) {
        .compressed => .{ .compressed = .{
            .pixel_format_raw = pixel_format_raw,
            .bytes = bytes[reader.offset..],
        } },
        .pixel => blk: {
            const format = try values.pixelFormat(pixel_format_raw);
            if (@rem(stride, 4) != 0) return error.InvalidEmfPlusBitmapStride;
            const expected_stride = try expectedStride(width, format);
            if (format != .undefined and magnitude(stride) != expected_stride)
                return error.InvalidEmfPlusBitmapStride;
            const expected_bytes = std.math.mul(u64, magnitude(stride), magnitude(height)) catch
                return error.LimitExceeded;
            if (expected_bytes > options.max_data_bytes) return error.LimitExceeded;

            const colors: ?palette.Palette = if (format.indexed())
                try palette.read(&reader, .{ .max_entries = options.max_palette_entries })
            else
                null;
            const semantic_size: usize = @intCast(expected_bytes);
            const pixel_bytes = try reader.take(semantic_size);
            const padding = bytes[reader.offset..];
            if (padding.len > 3) return error.InvalidEmfPlusBitmapPadding;
            break :blk .{ .pixel = .{
                .format = format,
                .palette = colors,
                .bytes = pixel_bytes,
                .alignment_padding = padding,
            } };
        },
    };
    return .{ .bytes = bytes, .width = width, .height = height, .stride = stride, .data = data };
}

fn magnitude(value: i32) u64 {
    return @intCast(if (value < 0) -@as(i64, value) else @as(i64, value));
}

fn expectedStride(width: i32, format: values.PixelFormat) !u64 {
    const bits = std.math.mul(u64, magnitude(width), format.bitsPerPixel()) catch return error.LimitExceeded;
    const bytes = try ceilDiv8(bits);
    return std.mem.alignForward(u64, bytes, 4);
}

fn ceilDiv8(bits: u64) !u64 {
    return (std.math.add(u64, bits, 7) catch return error.LimitExceeded) / 8;
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    std.mem.writeInt(i32, bytes[offset..][0..4], value, .little);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

test "EMF+ bitmap parses exact raw rows and all alignment padding widths" {
    const cases = [_]struct { width: i32, format: u32, stride: i32, pixels: usize, padding: usize }{
        .{ .width = 1, .format = 0x00021808, .stride = 4, .pixels = 4, .padding = 0 },
        .{ .width = 2, .format = 0x00021808, .stride = 8, .pixels = 8, .padding = 1 },
        .{ .width = 2, .format = 0x00022009, .stride = -8, .pixels = 8, .padding = 2 },
        .{ .width = 1, .format = 0x00021006, .stride = 4, .pixels = 4, .padding = 3 },
    };
    for (cases) |case| {
        var storage = [_]u8{0} ** 31;
        const size = 20 + case.pixels + case.padding;
        putI32(&storage, 0, case.width);
        putI32(&storage, 4, 1);
        putI32(&storage, 8, case.stride);
        putU32(&storage, 12, case.format);
        const value = try parse(storage[0..size], .{});
        try std.testing.expectEqual(case.pixels, value.data.pixel.bytes.len);
        try std.testing.expectEqual(case.padding, value.data.pixel.alignment_padding.len);
    }
}

test "EMF+ indexed bitmap parses and validates its palette before pixels" {
    var bytes = [_]u8{0} ** 40;
    putI32(&bytes, 0, 2);
    putI32(&bytes, 4, 1);
    putI32(&bytes, 8, 4);
    putU32(&bytes, 12, 0x00030803);
    putU32(&bytes, 24, 2);
    bytes[28..36].* = .{ 1, 2, 3, 0xff, 4, 5, 6, 0x80 };
    bytes[36..40].* = .{ 0, 1, 0xaa, 0xbb };
    const value = try parse(&bytes, .{});
    const pixel = value.data.pixel;
    try std.testing.expectEqual(@as(u32, 2), pixel.palette.?.count);
    try std.testing.expectEqualSlices(u8, bytes[36..40], pixel.bytes);
    try std.testing.expectEqual(@as(usize, 0), pixel.alignment_padding.len);
}

test "EMF+ compressed bitmap preserves every undefined header value and payload byte" {
    var bytes = [_]u8{0} ** 25;
    putI32(&bytes, 0, std.math.minInt(i32));
    putI32(&bytes, 4, -7);
    putI32(&bytes, 8, 3);
    putU32(&bytes, 12, 0xdeadbeef);
    putU32(&bytes, 16, 1);
    bytes[20..25].* = "PNG!?".*;
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(@as(u32, 0xdeadbeef), value.data.compressed.pixel_format_raw);
    try std.testing.expectEqualSlices(u8, "PNG!?", value.data.compressed.bytes);
}

test "EMF+ raw bitmap handles negative height and signed minima without overflow" {
    var negative = [_]u8{0} ** 36;
    putI32(&negative, 0, 2);
    putI32(&negative, 4, -2);
    putI32(&negative, 8, -8);
    putU32(&negative, 12, 0x00022009);
    const value = try parse(&negative, .{});
    try std.testing.expectEqual(@as(usize, 16), value.data.pixel.bytes.len);

    var boundary = [_]u8{0} ** 20;
    putI32(&boundary, 0, std.math.minInt(i32));
    putI32(&boundary, 4, 1);
    putI32(&boundary, 8, 0);
    putU32(&boundary, 12, 0x001a400e);
    try std.testing.expectError(error.InvalidEmfPlusBitmapStride, parse(&boundary, .{}));

    putI32(&boundary, 0, 1);
    putI32(&boundary, 4, std.math.minInt(i32));
    putI32(&boundary, 8, 4);
    putU32(&boundary, 12, 0x00022009);
    try std.testing.expectError(error.LimitExceeded, parse(&boundary, .{}));
}

test "EMF+ raw bitmap rejects every truncation stride mismatch oversized data and padding" {
    var bytes = [_]u8{0} ** 24;
    putI32(&bytes, 0, 1);
    putI32(&bytes, 4, 1);
    putI32(&bytes, 8, 4);
    putU32(&bytes, 12, 0x00021808);
    for (0..bytes.len) |cut| try std.testing.expectError(error.UnexpectedEnd, parse(bytes[0..cut], .{}));
    var invalid = bytes;
    for (1..4) |bad_stride| {
        putI32(&invalid, 8, @intCast(bad_stride));
        try std.testing.expectError(error.InvalidEmfPlusBitmapStride, parse(&invalid, .{}));
    }
    putI32(&invalid, 4, 0);
    putU32(&invalid, 12, 0);
    for (1..4) |bad_stride| {
        putI32(&invalid, 8, @intCast(bad_stride));
        try std.testing.expectError(error.InvalidEmfPlusBitmapStride, parse(invalid[0..20], .{}));
    }
    invalid = bytes;
    putI32(&invalid, 8, 8);
    try std.testing.expectError(error.InvalidEmfPlusBitmapStride, parse(&invalid, .{}));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_data_bytes = 23 }));
    var padding = [_]u8{0} ** 28;
    @memcpy(padding[0..24], &bytes);
    try std.testing.expectError(error.InvalidEmfPlusBitmapPadding, parse(&padding, .{}));
}
