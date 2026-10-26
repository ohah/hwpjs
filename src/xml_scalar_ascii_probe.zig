const std = @import("std");
const scalars = @import("text/scalars.zig");

comptime {
    _ = @import("xml/input_tests.zig");
    _ = @import("xml/tag_tests.zig");
    _ = @import("xml/reference_tests.zig");
    _ = @import("xml/namespace_tests.zig");
    _ = @import("xml/document_tests.zig");
}

test "ASCII Unicode scalar path preserves every byte position and encoding errors" {
    for (0..128) |value| {
        const bytes = [_]u8{ 'x', @intCast(value), 'y' };
        const scalar = (try scalars.read(&bytes, 1, .utf8)).?;
        try std.testing.expectEqual(@as(u21, @intCast(value)), scalar.value);
        try std.testing.expectEqual(@as(usize, 1), scalar.start);
        try std.testing.expectEqual(@as(usize, 2), scalar.end);
        try std.testing.expectEqual(@as(u21, 'y'), (try scalars.read(&bytes, scalar.end, .utf8)).?.value);
    }
    try std.testing.expect((try scalars.read("", 0, .utf8)) == null);
    try std.testing.expectError(error.UnexpectedEnd, scalars.read("", 1, .utf8));
    for ([_][]const u8{ "\x80", "\xc0\x80", "\xc1\xbf", "\xed\xa0\x80", "\xf4\x90\x80\x80", "\xff" }) |bytes| {
        try std.testing.expectError(error.InvalidUnicodeEncoding, scalars.read(bytes, 0, .utf8));
    }
    for ([_][]const u8{ "\xc2", "\xe0\xa0", "\xf0\x90\x80" }) |bytes| {
        try std.testing.expectError(error.UnexpectedEnd, scalars.read(bytes, 0, .utf8));
    }
}
