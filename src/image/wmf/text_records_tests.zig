const std = @import("std");
const t = std.testing;
const records = @import("records.zig");
const text_align = @import("text_align.zig");
const ext_text_out = @import("ext_text_out.zig");
const escape = @import("escape.zig");

fn record(function: u16, size_words: u32, parameters: []const u8) records.Record {
    return .{ .offset = 0, .size_words = size_words, .function = function, .parameters = parameters, .end = @as(usize, size_words) * 2 };
}

test "WMF text alignment validates combinations and optional reserved" {
    const short = [_]u8{ 0x18, 0 };
    const baseline = try text_align.parse(record(0x012e, 4, &short));
    try t.expectEqual(@as(u16, 0x18), baseline.raw);
    try t.expectEqual(@as(?u16, null), baseline.reserved);
    const long = [_]u8{ 1, 1, 0x34, 0x12 };
    const rtl = try text_align.parse(record(0x012e, 5, &long));
    try t.expectEqual(@as(?u16, 0x1234), rtl.reserved);
    try t.expectError(error.UnsupportedWmfTextAlignment, text_align.parse(record(0x012e, 4, &.{ 4, 0 })));
}

test "WMF ExtTextOut keeps odd padding and exact optional Dx" {
    const bytes = [_]u8{ 0xfe, 0xff, 3, 0, 3, 0, 0, 0, 'a', 'b', 'c', 0xd6, 1, 0, 0xfe, 0xff, 3, 0 };
    const value = try ext_text_out.parse(record(0x0a32, 12, &bytes), .absent);
    try t.expectEqual(@as(i16, 3), value.x);
    try t.expectEqual(@as(i16, -2), value.y);
    try t.expectEqualSlices(u8, "abc", value.string);
    try t.expectEqual(@as(?u8, 0xd6), value.padding);
    try t.expectEqual(@as(usize, 3), value.dx_count);
    try t.expectEqual(@as(i16, -2), try value.dx(1));
    try t.expectError(error.WmfDxIndexOutOfBounds, value.dx(3));
    try t.expectError(error.InvalidWmfDxSize, ext_text_out.parse(record(0x0a32, 11, bytes[0..16]), .absent));
}

test "WMF ExtTextOut rectangle layout is explicit and options are bounded" {
    const bytes = [_]u8{ 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 2, 0, 3, 0, 4, 0 };
    const value = try ext_text_out.parse(record(0x0a32, 11, &bytes), .from_options);
    try t.expectEqual(@as(i16, 1), value.rectangle.?.left);
    try t.expectEqual(@as(i16, 4), value.rectangle.?.bottom);
    try t.expectError(error.InvalidWmfExtTextOutSize, ext_text_out.parse(record(0x0a32, 7, bytes[0..8]), .from_options));
    var invalid = bytes;
    invalid[6] = 1;
    try t.expectError(error.UnsupportedWmfExtTextOutOptions, ext_text_out.parse(record(0x0a32, 11, &invalid), .present));
}

test "WMF escape enforces known function byte count and padding" {
    const bytes = [_]u8{ 15, 0, 3, 0, 1, 2, 3, 0xaa };
    const value = try escape.parse(record(0x0626, 7, &bytes));
    try t.expectEqual(@as(u16, 15), value.function_raw);
    try t.expectEqualSlices(u8, &.{ 1, 2, 3 }, value.data);
    try t.expectEqual(@as(?u8, 0xaa), value.padding);
    var invalid = bytes;
    invalid[0] = 0x24;
    try t.expectError(error.UnsupportedWmfEscapeFunction, escape.parse(record(0x0626, 7, &invalid)));
    invalid = bytes;
    invalid[2] = 5;
    try t.expectError(error.InvalidWmfEscapeSize, escape.parse(record(0x0626, 7, &invalid)));
}
