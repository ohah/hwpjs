const std = @import("std");
const color_ref = @import("../wmf/color_ref.zig");
const flood_fill_mode = @import("flood_fill_mode.zig");
const geometry = @import("geometry.zig");
const record_extent = @import("record_extent.zig");
const records = @import("records.zig");

pub const FloodFill = struct {
    start: geometry.PointL,
    color: color_ref.ColorRef,
    mode: flood_fill_mode.FloodFillMode,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?FloodFill {
    if (record.kind != .extfloodfill) return null;
    const end = record_extent.requiredEnd(record, 24) orelse return error.InvalidEmfFloodFillSize;
    return .{
        .start = try geometry.parsePointL(record.bytes[8..16]),
        .color = try color_ref.parse(record.bytes[16..20], .specified_zero),
        .mode = try flood_fill_mode.parse(std.mem.readInt(u32, record.bytes[20..24], .little)),
        .trailing_data = record.bytes[end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "EXTFLOODFILL preserves signed start ColorRef mode and trailing data" {
    var bytes = [_]u8{0} ** 28;
    std.mem.writeInt(i32, bytes[8..12], std.math.minInt(i32), .little);
    std.mem.writeInt(i32, bytes[12..16], std.math.maxInt(i32), .little);
    bytes[16..20].* = .{ 0x12, 0x34, 0x56, 0 };
    std.mem.writeInt(u32, bytes[20..24], @intFromEnum(flood_fill_mode.FloodFillMode.surface), .little);
    bytes[24..28].* = .{ 9, 8, 7, 6 };

    const value = (try parse(fixture(.extfloodfill, &bytes))).?;
    try std.testing.expectEqual(std.math.minInt(i32), value.start.x);
    try std.testing.expectEqual(std.math.maxInt(i32), value.start.y);
    try std.testing.expectEqual(@as(u8, 0x12), value.color.red);
    try std.testing.expectEqual(@as(u8, 0x34), value.color.green);
    try std.testing.expectEqual(@as(u8, 0x56), value.color.blue);
    try std.testing.expectEqual(@as(u32, 0x00563412), value.color.raw);
    try std.testing.expectEqual(flood_fill_mode.FloodFillMode.surface, value.mode);
    try std.testing.expectEqualSlices(u8, &.{ 9, 8, 7, 6 }, value.trailing_data);
}

test "EXTFLOODFILL rejects every truncation invalid fields and unrelated types" {
    var bytes = [_]u8{0} ** 28;
    for (0..24) |length|
        try std.testing.expectError(error.InvalidEmfFloodFillSize, parse(fixture(.extfloodfill, bytes[0..length])));
    var mismatched = fixture(.extfloodfill, bytes[0..24]);
    mismatched.size += 4;
    try std.testing.expectError(error.InvalidEmfFloodFillSize, parse(mismatched));

    bytes[19] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(fixture(.extfloodfill, bytes[0..24])));
    bytes[19] = 0;
    std.mem.writeInt(u32, bytes[20..24], 2, .little);
    try std.testing.expectError(error.InvalidEmfFloodFillMode, parse(fixture(.extfloodfill, bytes[0..24])));
    try std.testing.expect((try parse(fixture(.setpixelv, bytes[0..24]))) == null);
}
