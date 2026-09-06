const std = @import("std");
const t = std.testing;
const v = @import("video_data.zig");
test "video wire fields preserve IDs raw UTF16 and explicitly bounded extra" {
    const local = [_]u8{ 0, 0, 0, 0, 0, 128, 255, 255, 9, 128, 255 };
    const p = try v.Video.parse(&local, .specified_remainder);
    try t.expectEqual(32768, p.data.local.video_id);
    try t.expectEqual(65535, p.data.local.thumbnail_id);
    try t.expectEqualSlices(u8, local[8..], p.extra);
    for (0..8) |cut| try t.expectError(error.UnexpectedEnd, v.Video.parse(local[0..cut], .specified_remainder));
    const web = [_]u8{ 1, 0, 0, 0, 0, 0, 0, 216, 255, 255, 1, 128, 9, 128, 255 };
    const bounded = try v.Video.parse(&web, .{ .explicit_units = 3 });
    try t.expectEqualSlices(u8, web[4..10], bounded.data.web.tag_utf16);
    try t.expectEqual(web[4..].ptr, bounded.data.web.tag_utf16.ptr);
    try t.expectEqual(32769, bounded.data.web.thumbnail_id);
    try t.expectEqualSlices(u8, web[12..], bounded.extra);
    for (0..12) |cut| try t.expectError(error.UnexpectedEnd, v.Video.parse(web[0..cut], .{ .explicit_units = 3 }));
    try t.expectError(error.OddVideoWebTagBytes, v.Video.parse(&web, .specified_remainder));
    const remainder = try v.Video.parse(web[0..12], .specified_remainder);
    try t.expectEqualSlices(u8, web[4..10], remainder.data.web.tag_utf16);
    try t.expectEqual(0, remainder.extra.len);
    const empty = try v.Video.parse(web[0..6], .specified_remainder);
    try t.expectEqual(0, empty.data.web.tag_utf16.len);
    try t.expectEqual(0, empty.data.web.thumbnail_id);
    var unknown = [_]u8{255} ** 4;
    for ([_]i32{ -1, 2, std.math.minInt(i32), std.math.maxInt(i32) }) |kind| {
        std.mem.writeInt(i32, &unknown, kind, .little);
        try t.expectError(error.UnsupportedVideoType, v.Video.parse(&unknown, .specified_remainder));
    }
}
test "explicit UTF16 unit count bounds preserve nonzero cursor" {
    const b = [_]u8{255} ** 7;
    var r: @import("../../binary/reader.zig").Reader = .{ .bytes = &b, .offset = 1 };
    for ([_]usize{ 4, std.math.maxInt(usize) }) |count| {
        try t.expectError(error.UnexpectedEnd, @import("../utf16_string.zig").readUnits(&r, count));
        try t.expectEqual(1, r.offset);
    }
    try t.expectEqual(0, (try @import("../utf16_string.zig").readUnits(&r, 0)).len);
    try t.expectEqualSlices(u8, b[1..], try @import("../utf16_string.zig").readUnits(&r, 3));
    try t.expectEqual(7, r.offset);
    for ([_]usize{ 8, std.math.maxInt(usize) }) |offset| {
        r.offset = offset;
        try t.expectError(error.UnexpectedEnd, @import("../utf16_string.zig").readUnits(&r, 0));
        try t.expectEqual(offset, r.offset);
    }
}
