const std = @import("std");
const t = std.testing;
const records = @import("records.zig");
const mode_record = @import("mode_record.zig");
const point_s = @import("point_s.zig");
const point_record = @import("point_record.zig");
const text_color = @import("text_color.zig");

fn record(function: u16, size_words: u32, parameters: []const u8) records.Record {
    return .{ .offset = 0, .size_words = size_words, .function = function, .parameters = parameters, .end = @as(usize, size_words) * 2 };
}

test "WMF PointS has explicit XY and record YX wire orders" {
    const bytes = [_]u8{ 0xfe, 0xff, 3, 0 };
    const xy = point_s.readXY(&bytes);
    try t.expectEqual(@as(i16, -2), xy.x);
    try t.expectEqual(@as(i16, 3), xy.y);
    const yx = point_s.readYX(&bytes);
    try t.expectEqual(@as(i16, 3), yx.x);
    try t.expectEqual(@as(i16, -2), yx.y);
}

test "WMF point records preserve signed Y then X and exact kind" {
    const bytes = [_]u8{ 0xfe, 0xff, 3, 0 };
    const value = try point_record.parse(record(0x0214, 5, &bytes), .move_to);
    try t.expectEqual(@as(i16, 3), value.point.x);
    try t.expectEqual(@as(i16, -2), value.point.y);
    try t.expectError(error.InvalidWmfPointFunction, point_record.parse(record(0x0213, 5, &bytes), .move_to));
    try t.expectError(error.InvalidWmfPointSize, point_record.parse(record(0x0214, 4, &bytes), .move_to));
}

test "WMF mode records distinguish absent and ignored reserved WORD" {
    const short = [_]u8{ 1, 0 };
    const transparent = try mode_record.parse(record(0x0102, 4, &short), .background);
    try t.expectEqual(@as(?u16, null), transparent.reserved);
    const long = [_]u8{ 2, 0, 0x34, 0x12 };
    const opaque_mode = try mode_record.parse(record(0x0102, 5, &long), .background);
    try t.expectEqual(@as(?u16, 0x1234), opaque_mode.reserved);
    try t.expectError(error.UnsupportedWmfMode, mode_record.parse(record(0x0106, 4, &.{ 3, 0 }), .polygon_fill));
    try t.expectError(error.InvalidWmfModeSize, mode_record.parse(record(0x0104, 6, &long), .raster_operation));
}

test "WMF text color reuses explicit reserved policy" {
    const bytes = [_]u8{ 1, 2, 3, 2 };
    const value = try text_color.parse(record(0x0209, 5, &bytes), .observed_preserve);
    try t.expectEqual(@as(u32, 0x02030201), value.raw);
    try t.expectError(error.InvalidWmfColorReserved, text_color.parse(record(0x0209, 5, &bytes), .specified_zero));
    try t.expectError(error.InvalidWmfTextColorSize, text_color.parse(record(0x0209, 4, &bytes), .observed_preserve));
}
