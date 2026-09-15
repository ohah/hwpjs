const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const color_adjustment = @import("color_adjustment.zig");

pub const minimum_size = 8 + color_adjustment.size;

pub const SetColorAdjustment = struct {
    adjustment: color_adjustment.ColorAdjustment,
    trailing_data: []const u8,
};

pub fn parse(record: records.Record) !?SetColorAdjustment {
    if (record.kind != .setcoloradjustment) return null;
    const required_end = record_extent.requiredEnd(record, minimum_size) orelse
        return error.InvalidEmfSetColorAdjustmentRecordSize;
    return .{
        .adjustment = try color_adjustment.parse(record.bytes[8..required_end]),
        .trailing_data = record.bytes[required_end..],
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "SETCOLORADJUSTMENT parses the object and preserves record extensions" {
    var bytes = [_]u8{0} ** (minimum_size + 4);
    std.mem.writeInt(u16, bytes[8..10], color_adjustment.size, .little);
    std.mem.writeInt(u16, bytes[10..12], 1, .little);
    std.mem.writeInt(u16, bytes[12..14], 6, .little);
    std.mem.writeInt(u16, bytes[14..16], 2_500, .little);
    std.mem.writeInt(u16, bytes[16..18], 10_000, .little);
    std.mem.writeInt(u16, bytes[18..20], 65_000, .little);
    std.mem.writeInt(u16, bytes[20..22], 4_000, .little);
    std.mem.writeInt(u16, bytes[22..24], 6_000, .little);
    std.mem.writeInt(i16, bytes[24..26], -100, .little);
    std.mem.writeInt(i16, bytes[26..28], 0, .little);
    std.mem.writeInt(i16, bytes[28..30], 100, .little);
    std.mem.writeInt(i16, bytes[30..32], -1, .little);
    bytes[32..36].* = .{ 0xde, 0xad, 0xbe, 0xef };

    const value = (try parse(fixture(.setcoloradjustment, &bytes))) orelse return error.TestExpectedEqual;
    try std.testing.expectEqual(@as(u16, 2_500), value.adjustment.red_gamma);
    try std.testing.expectEqual(@as(i16, -100), value.adjustment.contrast);
    try std.testing.expectEqualSlices(u8, bytes[32..36], value.trailing_data);
}

test "SETCOLORADJUSTMENT rejects truncation declaration mismatch and unrelated records" {
    var bytes = [_]u8{0} ** minimum_size;
    std.mem.writeInt(u16, bytes[8..10], color_adjustment.size, .little);
    for (0..minimum_size) |cut|
        try std.testing.expectError(error.InvalidEmfSetColorAdjustmentRecordSize, parse(fixture(.setcoloradjustment, bytes[0..cut])));

    var declared_short = fixture(.setcoloradjustment, &bytes);
    declared_short.size -= 4;
    try std.testing.expectError(error.InvalidEmfSetColorAdjustmentRecordSize, parse(declared_short));
    var declared_long = fixture(.setcoloradjustment, &bytes);
    declared_long.size += 4;
    try std.testing.expectError(error.InvalidEmfSetColorAdjustmentRecordSize, parse(declared_long));
    try std.testing.expect((try parse(fixture(.settextcolor, &bytes))) == null);
}
