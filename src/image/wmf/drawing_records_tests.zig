const std = @import("std");
const t = std.testing;
const records = @import("records.zig");
const point_array = @import("point_array.zig");
const poly_record = @import("poly_record.zig");
const rect_record = @import("rect_record.zig");

fn record(function: u16, size_words: u32, parameters: []const u8) records.Record {
    return .{ .offset = 0, .size_words = size_words, .function = function, .parameters = parameters, .end = @as(usize, size_words) * 2 };
}

test "WMF borrowed PointS array keeps XY order and exact bounds" {
    const bytes = [_]u8{ 0xfe, 0xff, 3, 0, 4, 0, 0xfb, 0xff };
    const points = try point_array.fromExact(&bytes, 2);
    const first = try points.get(0);
    const second = try points.get(1);
    try t.expectEqual(@as(i16, -2), first.x);
    try t.expectEqual(@as(i16, 3), first.y);
    try t.expectEqual(@as(i16, 4), second.x);
    try t.expectEqual(@as(i16, -5), second.y);
    try t.expectError(error.WmfPointIndexOutOfBounds, points.get(2));
    try t.expectError(error.InvalidWmfPointArraySize, point_array.fromExact(bytes[0..7], 2));
}

test "WMF polygon and polyline enforce declared exact point arrays" {
    const two = [_]u8{ 2, 0, 1, 0, 2, 0, 3, 0, 4, 0 };
    const polygon = try poly_record.parse(record(0x0324, 8, &two), .polygon);
    try t.expectEqual(@as(usize, 2), polygon.points.count);
    const empty = [_]u8{ 0, 0 };
    const polyline = try poly_record.parse(record(0x0325, 4, &empty), .polyline);
    try t.expectEqual(@as(usize, 0), polyline.points.count);
    try t.expectError(error.InvalidWmfPolygonPointCount, poly_record.parse(record(0x0324, 4, &empty), .polygon));
    const negative = [_]u8{ 0xff, 0xff };
    try t.expectError(error.InvalidWmfPointCount, poly_record.parse(record(0x0325, 4, &negative), .polyline));
    try t.expectError(error.InvalidWmfPolySize, poly_record.parse(record(0x0325, 7, &two), .polyline));
}

test "WMF ellipse and rectangle map Bottom Right Top Left exactly" {
    const bytes = [_]u8{ 1, 0, 2, 0, 0xfd, 0xff, 0xfc, 0xff };
    const value = try rect_record.parse(record(0x0418, 7, &bytes), .ellipse);
    try t.expectEqual(@as(i16, -4), value.rect.left);
    try t.expectEqual(@as(i16, -3), value.rect.top);
    try t.expectEqual(@as(i16, 2), value.rect.right);
    try t.expectEqual(@as(i16, 1), value.rect.bottom);
    try t.expectError(error.InvalidWmfRectFunction, rect_record.parse(record(0x041b, 7, &bytes), .ellipse));
    try t.expectError(error.InvalidWmfRectSize, rect_record.parse(record(0x0418, 6, &bytes), .ellipse));
}
