const binary = @import("../../binary/reader.zig");
const point_data = @import("emf_plus_point_data.zig");
const record_flags = @import("emf_plus_record_flags.zig");
const values = @import("emf_plus_values.zig");

pub const Options = point_data.Options;

pub const ClosedCurveData = struct {
    relative: bool,
    compressed_flag: bool,
    tension: f32,
    count: u32,
    point_data: point_data.PointData,
};

pub fn parse(bytes: []const u8, flags: u16, options: Options) !ClosedCurveData {
    var reader: binary.Reader = .{ .bytes = bytes };
    const tension = try values.readFloat(&reader);
    const count = try reader.readInt(u32);
    if (count < 3) return error.InvalidEmfPlusClosedCurvePointCount;

    const relative = record_flags.isRelative(flags);
    const compressed = record_flags.isCompressed(flags);
    const points = point_data.parse(bytes[reader.offset..], count, relative, compressed, options) catch |err| switch (err) {
        error.InvalidEmfPlusPointDataSize, error.InvalidEmfPlusPointDataPadding => return error.InvalidEmfPlusClosedCurveDataSize,
        else => return err,
    };
    return .{
        .relative = relative,
        .compressed_flag = compressed,
        .tension = tension,
        .count = count,
        .point_data = points,
    };
}

const std = @import("std");

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], @bitCast(value), .little);
}

test "EMF+ closed curve data preserves tension and selects all point encodings" {
    var integer = [_]u8{0} ** 20;
    putF32(&integer, 0, -0.0);
    std.mem.writeInt(u32, integer[4..8], 3, .little);
    const compressed = try parse(&integer, 0x4000, .{});
    try std.testing.expectEqual(@as(u32, @bitCast(@as(f32, -0.0))), @as(u32, @bitCast(compressed.tension)));
    try std.testing.expectEqual(@as(u32, 3), compressed.count);
    try std.testing.expectEqual(@import("emf_plus_point.zig").Encoding.integer, compressed.point_data.encoding);

    var floating = [_]u8{0} ** 32;
    putF32(&floating, 0, std.math.nan(f32));
    std.mem.writeInt(u32, floating[4..8], 3, .little);
    const uncompressed = try parse(&floating, 0, .{});
    try std.testing.expect(std.math.isNan(uncompressed.tension));
    try std.testing.expectEqual(@import("emf_plus_point.zig").Encoding.floating, uncompressed.point_data.encoding);

    const relative_bytes = [_]u8{ 0, 0, 0, 0x3f, 3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 0xaa, 0xbb };
    const relative = try parse(&relative_bytes, 0x4800, .{});
    try std.testing.expect(relative.relative);
    try std.testing.expect(relative.compressed_flag);
    try std.testing.expectEqual(@import("emf_plus_point.zig").Encoding.relative, relative.point_data.encoding);
    try std.testing.expectEqualSlices(u8, "\xaa\xbb", relative.point_data.alignment_padding);
}

test "EMF+ closed curve data rejects prefix count point size padding and limit" {
    var bytes = [_]u8{0} ** 32;
    std.mem.writeInt(u32, bytes[4..8], 3, .little);
    _ = try parse(&bytes, 0, .{});
    for (0..8) |cut| {
        const result = parse(bytes[0..cut], 0, .{});
        if (result) |_| return error.TestExpectedError else |_| {}
    }
    for ([_]u32{ 0, 1, 2 }) |count| {
        var invalid = bytes;
        std.mem.writeInt(u32, invalid[4..8], count, .little);
        try std.testing.expectError(error.InvalidEmfPlusClosedCurvePointCount, parse(&invalid, 0, .{}));
    }
    try std.testing.expectError(error.InvalidEmfPlusClosedCurveDataSize, parse(bytes[0..31], 0, .{}));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, 0, .{ .max_points = 2 }));

    var excessive_padding = [_]u8{0} ** 20;
    std.mem.writeInt(u32, excessive_padding[4..8], 3, .little);
    excessive_padding[8..16].* = .{ 0x3f, 0xff, 0xc0, 1, 2, 0x7f, 0x7e, 3 };
    try std.testing.expectError(error.InvalidEmfPlusClosedCurveDataSize, parse(&excessive_padding, 0x0800, .{}));
}
