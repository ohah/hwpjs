const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const geometry = @import("geometry.zig");

pub const Value = union(enum) {
    window_extent: geometry.SizeL,
    window_origin: geometry.PointL,
    viewport_extent: geometry.SizeL,
    viewport_origin: geometry.PointL,
    brush_origin: geometry.PointL,
    move_to: geometry.PointL,
};

pub fn parse(record: records.Record) !?Value {
    switch (record.kind) {
        .setwindowextex,
        .setwindoworgex,
        .setviewportextex,
        .setviewportorgex,
        .setbrushorgex,
        .movetoex,
        => {},
        else => return null,
    }
    if (!record_extent.hasRequiredPrefix(record, 16)) return error.InvalidEmfPointRecordSize;
    return switch (record.kind) {
        .setwindowextex => .{ .window_extent = try geometry.parseSizeL(record.bytes[8..16]) },
        .setwindoworgex => .{ .window_origin = try geometry.parsePointL(record.bytes[8..16]) },
        .setviewportextex => .{ .viewport_extent = try geometry.parseSizeL(record.bytes[8..16]) },
        .setviewportorgex => .{ .viewport_origin = try geometry.parsePointL(record.bytes[8..16]) },
        .setbrushorgex => .{ .brush_origin = try geometry.parsePointL(record.bytes[8..16]) },
        .movetoex => .{ .move_to = try geometry.parsePointL(record.bytes[8..16]) },
        else => unreachable,
    };
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

test "all six fixed point and extent records parse signed fields" {
    const std = @import("std");
    var bytes = [_]u8{0} ** 16;
    std.mem.writeInt(i32, bytes[8..12], -123, .little);
    std.mem.writeInt(i32, bytes[12..16], 456, .little);
    try std.testing.expectEqual(@as(i32, -123), (try parse(fixture(.setwindowextex, &bytes))).?.window_extent.width);
    try std.testing.expectEqual(@as(i32, 456), (try parse(fixture(.setwindoworgex, &bytes))).?.window_origin.y);
    try std.testing.expectEqual(@as(i32, -123), (try parse(fixture(.setviewportextex, &bytes))).?.viewport_extent.width);
    try std.testing.expectEqual(@as(i32, 456), (try parse(fixture(.setviewportorgex, &bytes))).?.viewport_origin.y);
    try std.testing.expectEqual(@as(i32, -123), (try parse(fixture(.setbrushorgex, &bytes))).?.brush_origin.x);
    try std.testing.expectEqual(@as(i32, 456), (try parse(fixture(.movetoex, &bytes))).?.move_to.y);
}

test "point records require their prefix accept trailing data and do not claim unrelated types" {
    const std = @import("std");
    const oversized = [_]u8{0} ** 20;
    for ([_]records.RecordType{ .setwindowextex, .setwindoworgex, .setviewportextex, .setviewportorgex, .setbrushorgex, .movetoex }) |kind|
        try std.testing.expect((try parse(fixture(kind, &oversized))) != null);
    try std.testing.expectError(error.InvalidEmfPointRecordSize, parse(fixture(.movetoex, oversized[0..12])));
    try std.testing.expect((try parse(fixture(.lineto, oversized[0..16]))) == null);
}
