//! Compile-time byte patterns for tests; preserves the old string repetition type.
const std = @import("std");

pub fn repeat(comptime pattern: []const u8, comptime count: usize) *const [pattern.len * count:0]u8 {
    const value = comptime block: {
        var output: [pattern.len * count:0]u8 = undefined;
        for (0..count) |index| @memcpy(output[index * pattern.len ..][0..pattern.len], pattern);
        output[pattern.len * count] = 0;
        break :block output;
    };
    return &value;
}

test "comptime byte repetition preserves concatenation Unicode and empty input" {
    try std.testing.expectEqualStrings("rm rm x", repeat("rm ", 2) ++ "x");
    try std.testing.expectEqualStrings("a😀a😀", repeat("a😀", 2));
    try std.testing.expectEqualStrings("x", repeat("{", 0) ++ "x");
    try std.testing.expectEqualStrings("", repeat("", 3));
    try std.testing.expectEqual(@as(usize, 241), (repeat("rm ", 80) ++ "x").len);
}

test "comptime repeated XML retains every occurrence" {
    const xml = "<r>" ++ repeat("<e a='v'/>", 512) ++ "</r>";
    try std.testing.expectEqual(@as(usize, 512), std.mem.count(u8, xml, "<e a='v'/>"));
    try std.testing.expectEqual(@as(usize, 5127), xml.len);
}
