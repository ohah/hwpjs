const std = @import("std");
const binary = @import("../../binary/reader.zig");
const utf16 = @import("../../text/utf16.zig");
const font_values = @import("emf_plus_font_values.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const object = @import("emf_plus_object.zig");
const unit_type = @import("emf_plus_unit_type.zig");
const values = @import("emf_plus_values.zig");

pub const Options = struct {
    max_font_bytes: usize = 64 * 1024 * 1024,
    max_family_name_units: u32 = 1_000_000,
};

pub const Font = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    em_size: f32,
    size_unit: unit_type.UnitType,
    style: font_values.FontStyleFlags,
    reserved: u32,
    family_name_length: u32,
    family_name_utf16le: []const u8,
    family_name_stats: utf16.Stats,
    alignment_padding: []const u8,
};

pub fn parse(bytes: []const u8, options: Options) !Font {
    if (bytes.len > options.max_font_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const version = try graphics_version.parse(try reader.readInt(u32));
    const em_size = try values.readFloat(&reader);
    const size_unit = try unit_type.UnitType.parse(try reader.readInt(u32));
    const style = try font_values.FontStyleFlags.parse(try reader.readInt(i32));
    const reserved = try reader.readInt(u32);
    const family_name_length = try reader.readInt(u32);
    if (family_name_length > options.max_family_name_units) return error.LimitExceeded;
    const name_bytes = std.math.mul(usize, @as(usize, family_name_length), 2) catch return error.LimitExceeded;
    const family_name_utf16le = try reader.take(name_bytes);
    const family_name_stats = utf16.inspect(family_name_utf16le, .little) catch return error.InvalidEmfPlusFontFamilyName;
    const alignment_padding = bytes[reader.offset..];
    const required_padding = std.mem.alignForward(usize, reader.offset, 4) - reader.offset;
    if (alignment_padding.len != 0 and alignment_padding.len != required_padding)
        return error.InvalidEmfPlusFontPadding;
    return .{
        .bytes = bytes,
        .version = version,
        .em_size = em_size,
        .size_unit = size_unit,
        .style = style,
        .reserved = reserved,
        .family_name_length = family_name_length,
        .family_name_utf16le = family_name_utf16le,
        .family_name_stats = family_name_stats,
        .alignment_padding = alignment_padding,
    };
}

pub fn parseCompleted(value: object.Completed, options: Options) !Font {
    if (value.object_type != .font) return error.NotEmfPlusFontObject;
    return parse(value.object_data, options);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    std.mem.writeInt(i32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ Font preserves fields UTF-16 family name reserved value and padding" {
    var bytes = [_]u8{0} ** 36;
    putU32(&bytes, 0, 0xdbc01002);
    putF32(&bytes, 4, 40.5);
    putU32(&bytes, 8, 2);
    putI32(&bytes, 12, 0x0d);
    putU32(&bytes, 16, 0xdead_beef);
    putU32(&bytes, 20, 5);
    bytes[24..34].* = .{ 'A', 0, 'r', 0, 'i', 0, 'a', 0, 'l', 0 };
    bytes[34..36].* = .{ 0xaa, 0xbb };
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(@as(u12, 2), value.version.version);
    try std.testing.expectEqual(@as(f32, 40.5), value.em_size);
    try std.testing.expectEqual(unit_type.UnitType.pixel, value.size_unit);
    try std.testing.expect(value.style.bold and value.style.underline and value.style.strikeout);
    try std.testing.expect(!value.style.italic);
    try std.testing.expectEqual(@as(u32, 0xdead_beef), value.reserved);
    try std.testing.expectEqual(@as(u32, 5), value.family_name_length);
    try std.testing.expectEqualSlices(u8, bytes[24..34], value.family_name_utf16le);
    try std.testing.expectEqual(@as(usize, 5), value.family_name_stats.scalars);
    try std.testing.expectEqualSlices(u8, bytes[34..36], value.alignment_padding);
}

test "EMF+ Font counts UTF-16 code units and validates surrogate pairs" {
    var bytes = [_]u8{0} ** 28;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 8, 3);
    putU32(&bytes, 20, 2);
    bytes[24..28].* = .{ 0x3d, 0xd8, 0x00, 0xde };
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(@as(u32, 2), value.family_name_length);
    try std.testing.expectEqual(@as(usize, 1), value.family_name_stats.scalars);
    bytes[26..28].* = .{ 0, 0 };
    try std.testing.expectError(error.InvalidEmfPlusFontFamilyName, parse(&bytes, .{}));
}

test "EMF+ Font accepts every UnitType and empty family name" {
    inline for (0..7) |raw_unit| {
        var bytes = [_]u8{0} ** 24;
        putU32(&bytes, 0, 0xdbc01001);
        putU32(&bytes, 8, raw_unit);
        _ = try parse(&bytes, .{ .max_font_bytes = 24, .max_family_name_units = 0 });
    }
}

test "EMF+ Font accepts no padding or the exact object alignment width" {
    var bytes = [_]u8{0} ** 30;
    putU32(&bytes, 0, 0xdbc01001);
    putU32(&bytes, 8, 3);
    putU32(&bytes, 20, 1);
    bytes[24..30].* = .{ 'A', 0, 0xa1, 0xb2, 0xc3, 0xd4 };
    try std.testing.expectEqual(@as(usize, 0), (try parse(bytes[0..26], .{})).alignment_padding.len);
    const aligned = try parse(bytes[0..28], .{});
    try std.testing.expectEqualSlices(u8, bytes[26..28], aligned.alignment_padding);
    try std.testing.expectError(error.InvalidEmfPlusFontPadding, parse(bytes[0..27], .{}));
    try std.testing.expectError(error.InvalidEmfPlusFontPadding, parse(bytes[0..29], .{}));
    try std.testing.expectError(error.InvalidEmfPlusFontPadding, parse(&bytes, .{}));

    var even = [_]u8{0} ** 29;
    putU32(&even, 0, 0xdbc01001);
    putU32(&even, 8, 3);
    putU32(&even, 20, 2);
    even[24..28].* = .{ 'A', 0, 'B', 0 };
    _ = try parse(even[0..28], .{});
    try std.testing.expectError(error.InvalidEmfPlusFontPadding, parse(&even, .{}));
}

test "EMF+ Font rejects every truncation domains limits excess padding and wrong object type" {
    var bytes = [_]u8{0} ** 28;
    putU32(&bytes, 0, 0xdbc01001);
    putF32(&bytes, 4, -0.0);
    putU32(&bytes, 8, 6);
    putI32(&bytes, 12, 0x0f);
    putU32(&bytes, 20, 1);
    bytes[24..26].* = .{ 'X', 0 };
    bytes[26..28].* = .{ 1, 2 };
    for (0..26) |cut| {
        if (parse(bytes[0..cut], .{})) |_| return error.TestExpectedError else |_| {}
    }
    _ = try parse(&bytes, .{ .max_font_bytes = 28, .max_family_name_units = 1 });
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_font_bytes = 27 }));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_family_name_units = 0 }));
    var bad_unit = bytes;
    putU32(&bad_unit, 8, 7);
    try std.testing.expectError(error.InvalidEmfPlusUnitType, parse(&bad_unit, .{}));
    var bad_style = bytes;
    putI32(&bad_style, 12, 0x10);
    try std.testing.expectError(error.InvalidEmfPlusFontStyleFlags, parse(&bad_style, .{}));
    var padding = [_]u8{0} ** 30;
    @memcpy(padding[0..28], &bytes);
    try std.testing.expectError(error.InvalidEmfPlusFontPadding, parse(&padding, .{}));
    try std.testing.expectError(error.NotEmfPlusFontObject, parseCompleted(.{ .object_id = 0, .object_type = .image, .object_data = &bytes, .multipart = false }, .{}));
    _ = try parseCompleted(.{ .object_id = 0, .object_type = .font, .object_data = &bytes, .multipart = false }, .{});
}
