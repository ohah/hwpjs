const binary = @import("../../binary/reader.zig");
const rect_data = @import("emf_plus_rect_data.zig");
const values = @import("emf_plus_values.zig");

pub const ArcData = struct {
    start_angle: f32,
    sweep_angle: f32,
    rectangle: rect_data.RectData,
};

pub fn byteLength(compressed: bool) u32 {
    return if (compressed) 16 else 24;
}

pub fn read(reader: *binary.Reader, compressed: bool) !ArcData {
    return .{
        .start_angle = try values.readFloat(reader),
        .sweep_angle = try values.readFloat(reader),
        .rectangle = try rect_data.read(reader, compressed),
    };
}

test "EMF+ ArcData reads angles before the selected rectangle wire form" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 24;
    std.mem.writeInt(u32, bytes[0..4], @bitCast(@as(f32, -0.0)), .little);
    std.mem.writeInt(u32, bytes[4..8], @bitCast(std.math.nan(f32)), .little);
    for ([_]i16{ -32768, -1, 0, 32767 }, 0..) |value, index|
        std.mem.writeInt(i16, bytes[8 + index * 2 ..][0..2], value, .little);
    var compressed_reader: binary.Reader = .{ .bytes = &bytes };
    const compressed = try read(&compressed_reader, true);
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(compressed.start_angle)));
    try std.testing.expect(std.math.isNan(compressed.sweep_angle));
    try std.testing.expectEqual(@as(i16, -32768), compressed.rectangle.compressed.x);
    try std.testing.expectEqual(@as(i16, 32767), compressed.rectangle.compressed.height);
    try std.testing.expectEqual(@as(usize, byteLength(true)), compressed_reader.offset);

    for ([_]f32{ 1.25, -2.5, 3.75, -4.5 }, 0..) |value, index|
        std.mem.writeInt(u32, bytes[8 + index * 4 ..][0..4], @bitCast(value), .little);
    var float_reader: binary.Reader = .{ .bytes = &bytes };
    const floating = try read(&float_reader, false);
    try std.testing.expectEqual(@as(f32, 1.25), floating.rectangle.float.x);
    try std.testing.expectEqual(@as(f32, -4.5), floating.rectangle.float.height);
    try std.testing.expectEqual(@as(usize, byteLength(false)), float_reader.offset);
}
