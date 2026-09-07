const std = @import("std");
const t = std.testing;
const itxt = @import("international_text.zig");
const fixture = @import("international_fixture.zig");
test "PNG international text compression methods UTF8 borrowing and diagnostics" {
    for ([_]bool{ false, true }) |compressed| {
        const raw = try fixture.payload(t.allocator, compressed, "ko-KR", "번역\n", "한글😀\t\u{0080}");
        defer t.allocator.free(raw);
        for (0..256) |method| {
            raw[3] = @intCast(method);
            if (compressed and method != 0) {
                try t.expectError(error.UnsupportedPngTextCompressionMethod, itxt.decode(t.allocator, raw, .{}));
            } else {
                var v = try itxt.decode(t.allocator, raw, .{});
                defer v.deinit(t.allocator);
                try t.expectEqualStrings("한글😀\t\u{0080}", v.text);
                try t.expectEqual(compressed, v.owned_text != null);
                try t.expectEqual(@intFromPtr(raw.ptr), @intFromPtr(v.keyword.ptr));
                if (!compressed) try t.expectEqual(@intFromPtr(raw.ptr) + raw.len - v.text.len, @intFromPtr(v.text.ptr));
                try t.expectEqual(@as(usize, 2), v.text_report.discouraged_controls);
                try t.expectEqual(@as(usize, 1), v.translated_report.linefeeds);
                try t.expect(v.language_report.?.syntax.registry_validated);
            }
        }
    }
}
test "PNG international text malformed framing flags language and empty fields" {
    var raw = [_]u8{ 'K', 0, 0, 0, 0, 0 };
    for (0..256) |flag| {
        raw[2] = @intCast(flag);
        if (flag > 1) try t.expectError(error.InvalidPngInternationalCompressionFlag, itxt.decode(t.allocator, &raw, .{}));
    }
    raw[2] = 0;
    for (0..raw.len) |end| {
        if (itxt.decode(t.allocator, raw[0..end], .{})) |value| {
            var v = value;
            v.deinit(t.allocator);
            return error.ExpectedFailure;
        } else |_| {}
    }
    var empty = try itxt.decode(t.allocator, &raw, .{ .max_text_bytes = 0, .language = .{ .max_bytes = 0, .max_subtags = 0 } });
    defer empty.deinit(t.allocator);
    try t.expect(empty.language_report == null);
    for ([_][]const u8{ "en-cmn", "zzzz", "en-abcde", "en--US" }) |language| {
        const bad = try fixture.payload(t.allocator, false, language, "", "");
        defer t.allocator.free(bad);
        if (itxt.decode(t.allocator, bad, .{})) |value| {
            var v = value;
            v.deinit(t.allocator);
            return error.ExpectedFailure;
        } else |_| {}
    }
    const limited = try fixture.payload(t.allocator, false, "en", "", "ABC");
    defer t.allocator.free(limited);
    try t.expectError(error.LimitExceeded, itxt.decode(t.allocator, limited, .{ .max_text_bytes = 2 }));
    try t.expectError(error.LimitExceeded, itxt.decode(t.allocator, limited, .{ .language = .{ .max_bytes = 1 } }));
}
test "PNG international text UTF8 errors are distinct from discouraged scalars" {
    for ([_][]const u8{ "\x80", "\xc0\x80", "\xed\xa0\x80", "\xf4\x90\x80\x80", "\xf0\x9f", "\xff" }) |bad| {
        try t.expectError(error.InvalidPngInternationalUtf8, itxt.utf8.inspect(bad));
        for ([_]bool{ false, true }) |compressed| {
            const raw = try fixture.payload(t.allocator, compressed, "", "", bad);
            defer t.allocator.free(raw);
            try t.expectError(error.InvalidPngInternationalUtf8, itxt.decode(t.allocator, raw, .{}));
        }
    }
    for (1..160) |c| {
        var buf: [4]u8 = undefined;
        const n = try std.unicode.utf8Encode(@intCast(c), &buf);
        const r = try itxt.utf8.inspect(buf[0..n]);
        try t.expectEqual(@as(usize, if ((c < 32 and c != 10) or c >= 127) 1 else 0), r.discouraged_controls);
    }
    _ = try itxt.utf8.inspect("\u{feff}\u{ffff}\u{10ffff}");
    try t.expectError(error.InvalidPngTextNull, itxt.utf8.inspect("\x00"));
}
test "PNG international text aggregate budget atomicity and deferred extension stats" {
    const State = @import("metadata.zig").State;
    const h: @import("header.zig").Header = .{ .width = 1, .height = 1, .color_type = 0, .bit_depth = 8, .interlace = 0 };
    const raw = try fixture.payload(t.allocator, true, "en-u-zz-foobar", "", "ABC");
    defer t.allocator.free(raw);
    const i: @import("chunks.zig").Chunk = .{ .name = "iTXt".*, .payload = raw, .raw = &.{} };
    const p: @import("chunks.zig").Chunk = .{ .name = "tEXt".*, .payload = "K\x00AB", .raw = &.{} };
    for ([_]bool{ false, true }) |reverse| {
        var s: State = .{};
        try s.consumeBounded(t.allocator, h, 0, if (reverse) i else p, 5);
        const before = s;
        try t.expectError(error.LimitExceeded, s.consumeBounded(t.allocator, h, 0, if (reverse) p else i, 4));
        try t.expectEqualDeep(before, s);
        try s.consumeBounded(t.allocator, h, 0, if (reverse) p else i, 5);
        try t.expectEqual(@as(usize, 3), s.international_text.text_bytes);
        try t.expectEqual(@as(usize, 1), s.international_text.extension_semantics_deferred);
    }
    var s: State = .{ .international_text = .{ .text_bytes = std.math.maxInt(usize) }, .text_bytes = 1 };
    try t.expectError(error.LimitExceeded, s.consumeBounded(t.allocator, h, 0, i, std.math.maxInt(usize)));
}
fn allocations(a: std.mem.Allocator, good: []const u8, bad: []const u8) !void {
    const pixels = @import("pixels.zig");
    const r = try pixels.inspect(a, good, .{});
    try t.expectEqual(@as(usize, 3), r.international_text.text_bytes);
    if (pixels.inspect(a, bad, .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.InvalidPngTextNull, err),
    }
}
test "PNG international text integrated allocation failures after decompression" {
    const pf = @import("pixels_fixture.zig");
    const good_raw = try fixture.payload(t.allocator, true, "sl-rozaj-biske-1994", "", "ABC");
    defer t.allocator.free(good_raw);
    const bad_raw = try fixture.payload(t.allocator, true, "sl-rozaj-biske-1994", "", "A\x00B");
    defer t.allocator.free(bad_raw);
    const good = try pf.withMetadata(t.allocator, 0, &.{.{ .name = "iTXt", .bytes = good_raw }});
    defer t.allocator.free(good);
    const bad = try pf.withMetadata(t.allocator, 0, &.{.{ .name = "iTXt", .bytes = bad_raw }});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, allocations, .{ good, bad });
}
