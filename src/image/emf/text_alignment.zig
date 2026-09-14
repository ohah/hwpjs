const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");

pub const LowAxis = enum(u32) {
    default = 0,
    end = 2,
    center = 6,
};

pub const HighAxis = enum(u32) {
    default = 0,
    edge = 8,
    baseline = 24,
};

pub const Alignment = struct {
    raw: u32,
    update_current_position: bool,
    low_axis: LowAxis,
    high_axis: HighAxis,
    right_to_left: bool,
};

pub fn parse(record: records.Record) !?Alignment {
    if (record.kind != .settextalign) return null;
    if (!record_extent.hasRequiredPrefix(record, 12)) return error.InvalidEmfTextAlignmentRecordSize;
    const raw = std.mem.readInt(u32, record.bytes[8..12], .little);
    if ((raw & ~@as(u32, 0x011f)) != 0) return error.InvalidEmfTextAlignmentFlags;
    const low_axis = std.enums.fromInt(LowAxis, raw & 0x0006) orelse return error.InvalidEmfTextAlignmentFlags;
    const high_axis = std.enums.fromInt(HighAxis, raw & 0x0018) orelse return error.InvalidEmfTextAlignmentFlags;
    return .{
        .raw = raw,
        .update_current_position = (raw & 0x0001) != 0,
        .low_axis = low_axis,
        .high_axis = high_axis,
        .right_to_left = (raw & 0x0100) != 0,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn bytesFor(raw: u32) [12]u8 {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(u32, bytes[8..12], raw, .little);
    return bytes;
}

test "text alignment accepts every defined component combination" {
    const lows = [_]LowAxis{ .default, .end, .center };
    const highs = [_]HighAxis{ .default, .edge, .baseline };
    for (lows) |low| for (highs) |high| for ([_]bool{ false, true }) |update| for ([_]bool{ false, true }) |rtl| {
        const raw = @intFromEnum(low) | @intFromEnum(high) |
            @as(u32, @intFromBool(update)) | (@as(u32, @intFromBool(rtl)) << 8);
        const alignment = (try parse(fixture(.settextalign, &bytesFor(raw)))).?;
        try std.testing.expectEqual(raw, alignment.raw);
        try std.testing.expectEqual(update, alignment.update_current_position);
        try std.testing.expectEqual(low, alignment.low_axis);
        try std.testing.expectEqual(high, alignment.high_axis);
        try std.testing.expectEqual(rtl, alignment.right_to_left);
    };
}

test "text alignment rejects undefined bits and mutually exclusive values" {
    for ([_]u32{ 0x0004, 0x0010, 0x001c, 0x0020, 0x0080, 0x0200, std.math.maxInt(u32) }) |raw| {
        try std.testing.expectError(error.InvalidEmfTextAlignmentFlags, parse(fixture(.settextalign, &bytesFor(raw))));
    }
}

test "text alignment requires its prefix accepts trailing data and does not claim unrelated records" {
    var short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfTextAlignmentRecordSize, parse(fixture(.settextalign, &short)));
    var declared_twelve = fixture(.settextalign, &short);
    declared_twelve.size = 12;
    try std.testing.expectError(error.InvalidEmfTextAlignmentRecordSize, parse(declared_twelve));
    var long = [_]u8{0} ** 16;
    try std.testing.expectEqual(@as(u32, 0), (try parse(fixture(.settextalign, &long))).?.raw);
    var declared_twelve_long = fixture(.settextalign, &long);
    declared_twelve_long.size = 12;
    try std.testing.expectError(error.InvalidEmfTextAlignmentRecordSize, parse(declared_twelve_long));
    try std.testing.expect((try parse(fixture(.savedc, short[0..8]))) == null);
}
