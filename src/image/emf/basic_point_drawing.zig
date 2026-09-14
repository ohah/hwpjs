const std = @import("std");
const geometry = @import("geometry.zig");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const color_ref = @import("../wmf/color_ref.zig");

pub const SetPixel = struct { point: geometry.PointL, color: color_ref.ColorRef };
pub const Value = union(enum) { line_to: geometry.PointL, set_pixel: SetPixel };

pub fn parse(record: records.Record) !?Value {
    return switch (record.kind) {
        .lineto => {
            if (!record_extent.hasRequiredPrefix(record, 16)) return error.InvalidEmfLineToRecordSize;
            return .{ .line_to = try geometry.parsePointL(record.bytes[8..16]) };
        },
        .setpixelv => {
            if (!record_extent.hasRequiredPrefix(record, 20)) return error.InvalidEmfSetPixelRecordSize;
            return .{ .set_pixel = .{
                .point = try geometry.parsePointL(record.bytes[8..16]),
                .color = try color_ref.parse(record.bytes[16..20], .specified_zero),
            } };
        },
        else => null,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "LINETO and SETPIXELV preserve signed PointL and ColorRef wire order" {
    var line = [_]u8{0} ** 16;
    std.mem.writeInt(i32, line[8..12], std.math.minInt(i32), .little);
    std.mem.writeInt(i32, line[12..16], std.math.maxInt(i32), .little);
    const endpoint = (try parse(fixture(.lineto, &line))).?.line_to;
    try std.testing.expectEqual(@as(i32, std.math.minInt(i32)), endpoint.x);
    try std.testing.expectEqual(@as(i32, std.math.maxInt(i32)), endpoint.y);

    var pixel = [_]u8{0} ** 20;
    std.mem.writeInt(i32, pixel[8..12], -1, .little);
    pixel[16..20].* = .{ 0x12, 0x34, 0x56, 0 };
    const value = (try parse(fixture(.setpixelv, &pixel))).?.set_pixel;
    try std.testing.expectEqual(@as(i32, -1), value.point.x);
    try std.testing.expectEqual(@as(u8, 0x12), value.color.red);
    try std.testing.expectEqual(@as(u8, 0x34), value.color.green);
    try std.testing.expectEqual(@as(u8, 0x56), value.color.blue);
    try std.testing.expectEqual(@as(u32, 0x00563412), value.color.raw);
}

test "basic point drawing records require prefixes and accept trailing data" {
    const line = [_]u8{0} ** 20;
    for (0..16) |length|
        try std.testing.expectError(error.InvalidEmfLineToRecordSize, parse(fixture(.lineto, line[0..length])));
    try std.testing.expect((try parse(fixture(.lineto, &line))) != null);
    var wrong_line = fixture(.lineto, line[0..16]);
    wrong_line.size = 12;
    try std.testing.expectError(error.InvalidEmfLineToRecordSize, parse(wrong_line));

    const pixel = [_]u8{0} ** 24;
    for (0..20) |length|
        try std.testing.expectError(error.InvalidEmfSetPixelRecordSize, parse(fixture(.setpixelv, pixel[0..length])));
    try std.testing.expect((try parse(fixture(.setpixelv, &pixel))) != null);
    var wrong_pixel = fixture(.setpixelv, pixel[0..20]);
    wrong_pixel.size = 16;
    try std.testing.expectError(error.InvalidEmfSetPixelRecordSize, parse(wrong_pixel));
}

test "SETPIXELV enforces specified-zero ColorRef and parser claims only two kinds" {
    var pixel = [_]u8{0} ** 20;
    pixel[19] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(fixture(.setpixelv, &pixel)));
    try std.testing.expect((try parse(fixture(.movetoex, pixel[0..16]))) == null);
    try std.testing.expect((try parse(fixture(.settextcolor, pixel[0..12]))) == null);
}
