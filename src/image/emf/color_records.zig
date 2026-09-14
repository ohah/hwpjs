const std = @import("std");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const color_ref = @import("../wmf/color_ref.zig");

pub const Value = union(enum) {
    text: color_ref.ColorRef,
    background: color_ref.ColorRef,
};

pub fn parse(record: records.Record) !?Value {
    const kind = record.kind;
    switch (kind) {
        .settextcolor, .setbkcolor => {},
        else => return null,
    }
    if (!record_extent.hasRequiredPrefix(record, 12)) return error.InvalidEmfColorRecordSize;
    const color = try color_ref.parse(record.bytes[8..12], .specified_zero);
    return switch (kind) {
        .settextcolor => .{ .text = color },
        .setbkcolor => .{ .background = color },
        else => unreachable,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "color records parse text and background ColorRef in wire order" {
    var bytes = [_]u8{0} ** 12;
    bytes[8..12].* = .{ 0x12, 0x34, 0x56, 0 };
    const text = (try parse(fixture(.settextcolor, &bytes))).?.text;
    try std.testing.expectEqual(@as(u32, 0x00563412), text.raw);
    try std.testing.expectEqual(@as(u8, 0x12), text.red);
    try std.testing.expectEqual(@as(u8, 0x34), text.green);
    try std.testing.expectEqual(@as(u8, 0x56), text.blue);
    try std.testing.expectEqual(@as(u8, 0), text.reserved);
    const background = (try parse(fixture(.setbkcolor, &bytes))).?.background;
    try std.testing.expectEqual(text.raw, background.raw);
}

test "color records require their prefix accept trailing data and enforce zero reserved byte" {
    var short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfColorRecordSize, parse(fixture(.settextcolor, &short)));
    var declared_twelve = fixture(.settextcolor, &short);
    declared_twelve.size = 12;
    try std.testing.expectError(error.InvalidEmfColorRecordSize, parse(declared_twelve));

    var long = [_]u8{0} ** 16;
    try std.testing.expect((try parse(fixture(.setbkcolor, &long))) != null);
    var declared_twelve_long = fixture(.setbkcolor, &long);
    declared_twelve_long.size = 12;
    try std.testing.expectError(error.InvalidEmfColorRecordSize, parse(declared_twelve_long));

    var reserved = [_]u8{0} ** 12;
    reserved[11] = 1;
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(fixture(.settextcolor, &reserved)));
    try std.testing.expectError(error.InvalidWmfColorReserved, parse(fixture(.setbkcolor, &reserved)));
    try std.testing.expect((try parse(fixture(.savedc, short[0..8]))) == null);
}
