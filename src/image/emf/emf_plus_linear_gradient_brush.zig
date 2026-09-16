const std = @import("std");
const argb = @import("emf_plus_argb.zig");
const brush_values = @import("emf_plus_brush_values.zig");
const geometry = @import("emf_plus_geometry.zig");
const optional = @import("emf_plus_brush_optional.zig");
const binary = @import("../../binary/reader.zig");

pub const LinearGradient = struct {
    bytes: []const u8,
    flags_raw: u32,
    wrap_mode: brush_values.WrapMode,
    rectangle: geometry.RectF,
    start_color: argb.Argb,
    end_color: argb.Argb,
    reserved_1: u32,
    reserved_2: u32,
    optional_data: optional.Linear,
};

pub fn parse(bytes: []const u8) !LinearGradient {
    var reader: binary.Reader = .{ .bytes = bytes };
    const flags = try reader.readInt(u32);
    try optional.validateLinearFlags(flags);
    const wrap_mode = try brush_values.wrapMode(try reader.readInt(u32));
    const rectangle = try geometry.readRectF(&reader);
    const start_color = try argb.read(&reader);
    const end_color = try argb.read(&reader);
    const reserved_1 = try reader.readInt(u32);
    const reserved_2 = try reader.readInt(u32);
    const optional_data = try optional.readLinear(&reader, flags);
    if (reader.offset != bytes.len) return error.InvalidEmfPlusLinearGradientTrailingData;
    return .{
        .bytes = bytes,
        .flags_raw = flags,
        .wrap_mode = wrap_mode,
        .rectangle = rectangle,
        .start_color = start_color,
        .end_color = end_color,
        .reserved_1 = reserved_1,
        .reserved_2 = reserved_2,
        .optional_data = optional_data,
    };
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

test "EMF+ linear gradient parses fixed fields reserved values and preset colors" {
    var bytes = [_]u8{0} ** 60;
    putU32(&bytes, 0, 0x04);
    putU32(&bytes, 4, 3);
    for ([_]f32{ 1, 2, 3, 4 }, 0..) |value, index| putF32(&bytes, 8 + index * 4, value);
    putU32(&bytes, 24, 0x44332211);
    putU32(&bytes, 28, 0x88776655);
    putU32(&bytes, 32, 0xdeadbeef);
    putU32(&bytes, 36, 0x01234567);
    putU32(&bytes, 40, 2);
    putF32(&bytes, 44, 0.0);
    putF32(&bytes, 48, 1.0);
    putU32(&bytes, 52, 0x04030201);
    putU32(&bytes, 56, 0x08070605);
    const value = try parse(&bytes);
    try std.testing.expectEqual(brush_values.WrapMode.tile_flip_xy, value.wrap_mode);
    try std.testing.expectEqual(@as(f32, 4), value.rectangle.height);
    try std.testing.expectEqual(@as(u32, 0xdeadbeef), value.reserved_1);
    try std.testing.expectEqual(@as(u32, 0x01234567), value.reserved_2);
    try std.testing.expectEqual(@as(u32, 0x08070605), value.optional_data.preset_colors.?.color(1).?.raw());
}

test "EMF+ linear gradient rejects every fixed truncation bad flags wrap and trailing data" {
    const bytes = [_]u8{0} ** 40;
    for (0..40) |cut| try expectError(bytes[0..cut]);
    var invalid = bytes;
    putU32(&invalid, 0, 0x20);
    try std.testing.expectError(error.InvalidEmfPlusBrushDataFlags, parse(&invalid));
    invalid = bytes;
    putU32(&invalid, 4, 5);
    try std.testing.expectError(error.InvalidEmfPlusWrapMode, parse(&invalid));
    var trailing = [_]u8{0} ** 41;
    try std.testing.expectError(error.InvalidEmfPlusLinearGradientTrailingData, parse(&trailing));
}

fn expectError(bytes: []const u8) !void {
    if (parse(bytes)) |_| return error.TestExpectedError else |_| {}
}
