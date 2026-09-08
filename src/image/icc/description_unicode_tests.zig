const std = @import("std");
const t = std.testing;
const api = @import("description_unicode.zig");
const parser = @import("text_description.zig");
const fixture = @import("text_description_fixture.zig").make;
test "ICC description UTF16BE distinguishes absent and empty with exact budget" {
    for ([_]usize{ 0, 1, 2 }) |units| {
        const bytes = try fixture(t.allocator, 3, units, 0);
        defer t.allocator.free(bytes);
        const view = try parser.parse(bytes, .{});
        const r = try api.inspectUtf16BE(view, units * 2);
        try t.expectEqual(units != 0, r.present);
        try t.expectEqual(units * 2, r.inspected_bytes);
        try t.expectEqual(units, r.text.scalars);
        try t.expectEqual(@as(usize, @intFromBool(units != 0)), r.text.nul_scalars);
        try t.expectEqual(units != 0, r.text.ends_in_nul);
        try t.expect(r.language_deferred and r.script_deferred and view.unicode_deferred);
        if (units != 0) try t.expectError(error.LimitExceeded, api.inspectUtf16BE(view, units * 2 - 1));
    }
}
test "ICC description UTF16BE rejects lone surrogates and preserves scalar statistics" {
    const bytes = try fixture(t.allocator, 1, 5, 0);
    defer t.allocator.free(bytes);
    const text = bytes[21..31];
    for ([_]u16{ 0xfeff, 0xd83d, 0xde00, 0, 0 }, 0..) |unit, i| std.mem.writeInt(u16, text[2 * i ..][0..2], unit, .big);
    const r = try api.inspectUtf16BE(try parser.parse(bytes, .{}), 10);
    try t.expectEqual(@as(usize, 4), r.text.scalars);
    try t.expectEqual(@as(usize, 2), r.text.nul_scalars);
    try t.expectEqual(@as(usize, 1), r.text.bom_scalars);
    try t.expect(r.text.ends_in_nul);
    std.mem.writeInt(u16, text[4..6], 65, .big);
    try t.expectError(error.InvalidUnicodeEncoding, api.inspectUtf16BE(try parser.parse(bytes, .{}), 10));
    std.mem.writeInt(u16, text[2..4], 0xdc00, .big);
    try t.expectError(error.InvalidUnicodeEncoding, api.inspectUtf16BE(try parser.parse(bytes, .{}), 10));
    try t.expectError(error.LimitExceeded, api.inspectUtf16BE(try parser.parse(bytes, .{}), 9));
}
test "ICC description UTF16BE exhausts single code units and surrogate pair endpoints" {
    const bytes = try fixture(t.allocator, 1, 2, 0);
    defer t.allocator.free(bytes);
    for (0..65536) |value| {
        std.mem.writeInt(u16, bytes[21..23], @intCast(value), .big);
        const view = try parser.parse(bytes, .{});
        if (value >= 0xd800 and value <= 0xdfff) {
            try t.expectError(error.InvalidUnicodeEncoding, api.inspectUtf16BE(view, 4));
        } else {
            const r = try api.inspectUtf16BE(view, 4);
            try t.expectEqual(@as(usize, 2), r.text.scalars);
            try t.expectEqual(@as(usize, 1) + @intFromBool(value == 0), r.text.nul_scalars);
            try t.expectEqual(@as(usize, @intFromBool(value == 0xfeff)), r.text.bom_scalars);
        }
    }
    const paired = try fixture(t.allocator, 2, 3, 0);
    defer t.allocator.free(paired);
    for ([_]u16{ 0xd800, 0xdbff }) |high| for ([_]u16{ 0xdc00, 0xdfff }) |low| {
        std.mem.writeInt(u16, paired[22..24], high, .big);
        std.mem.writeInt(u16, paired[24..26], low, .big);
        const r = try api.inspectUtf16BE(try parser.parse(paired, .{}), 6);
        try t.expectEqual(@as(usize, 2), r.text.scalars);
        try t.expectEqual(@as(usize, 1), r.text.nul_scalars);
    };
}
