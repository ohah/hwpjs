const std = @import("std");
const xstring = @import("xstring.zig");

fn expectDecoded(source: []const u8, expected: []const u8, expected_escapes: usize) !void {
    var result = try xstring.decode(std.testing.allocator, source, expected.len);
    defer result.deinit(std.testing.allocator);
    try std.testing.expectEqualStrings(expected, result.text.?);
    try std.testing.expectEqual(expected_escapes, result.escapes);
    try std.testing.expectEqual(@as(usize, 0), result.unsupported_surrogates);
}

test "HWPX Xstring decodes controls and paired UTF16 surrogates" {
    try expectDecoded("A_x0008_B", "A\x08B", 1);
    try expectDecoded("_xD83D__xDE00_", "😀", 2);
    try expectDecoded("_x000D__x000a__x0009_", "\r\n\t", 3);
    try expectDecoded("_x0041__x00e9_", "Aé", 2);
}

test "HWPX Xstring does not recursively decode an escaped literal underscore" {
    try expectDecoded("_x005F_x0008_", "_x0008_", 1);
    try expectDecoded("_X0008_ _x000_ _xGGGG_", "_X0008_ _x000_ _xGGGG_", 0);
    try expectDecoded("가_x005f_나", "가_나", 1);
}

test "HWPX Xstring preserves unsupported unpaired surrogate escapes as a diagnostic" {
    inline for (.{ "_xD800_", "_xDC00_", "_xD800_A", "_xD800__xD800__xDC00_" }) |source| {
        var result = try xstring.decode(std.testing.allocator, source, source.len);
        defer result.deinit(std.testing.allocator);
        try std.testing.expect(result.text == null);
        try std.testing.expect(result.unsupported_surrogates > 0);
    }
}

test "HWPX Xstring applies exact decoded byte bounds and cleans allocation failures" {
    var result = try xstring.decode(std.testing.allocator, "_xD83D__xDE00_", 4);
    result.deinit(std.testing.allocator);
    try std.testing.expectError(error.LimitExceeded, xstring.decode(std.testing.allocator, "_xD83D__xDE00_", 3));
    try std.testing.expectError(error.InvalidUtf8, xstring.decode(std.testing.allocator, "\xff", 4));
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, source: []const u8) !void {
            var decoded = try xstring.decode(a, source, 32);
            decoded.deinit(a);
        }
    }.run, .{"A_x0008_B_xD83D__xDE00_"});
}
