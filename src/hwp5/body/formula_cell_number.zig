//! Cell text padding is separate from strict cached-number grammar.
//! Only outer U+0020 is accepted; never coerce empty or nonnumeric cells to zero.
const std = @import("std");
pub fn parse(bytes: []const u8) !f64 {
    if (bytes.len % 2 != 0) return error.UnexpectedEnd;
    if (bytes.len / 2 > 128) return error.LimitExceeded;
    var begin: usize = 0;
    var end = bytes.len;
    while (begin < end and std.mem.readInt(u16, bytes[begin..][0..2], .little) == ' ') begin += 2;
    while (end > begin and std.mem.readInt(u16, bytes[end - 2 ..][0..2], .little) == ' ') end -= 2;
    return @import("formula_number.zig").parse(bytes[begin..end]);
}

fn wire(comptime text: []const u8) [text.len * 2]u8 {
    var bytes = @as([(text.len * 2)]u8, @splat(0));
    for (text, 0..) |value, i| bytes[i * 2] = value;
    return bytes;
}

test "formula cell padding retains strict number grammar and original input" {
    try std.testing.expectEqual(@as(f64, 19200), try parse(&wire(" 19,200")));
    try std.testing.expectEqual(@as(f64, 6400), try parse(&wire("  6,400")));
    try std.testing.expectEqual(@as(f64, -1234.5), try parse(&wire(" -1,234.50 ")));
    inline for (.{ "", " ", "1 2", "1 ,000", "\t1", "1\n", " 1e3 ", " 12,34 " }) |text| try std.testing.expectError(error.InvalidFormulaNumber, parse(&wire(text)));
    try std.testing.expectError(error.InvalidFormulaNumber, parse(&.{ 0xa0, 0, '1', 0 }));
    try std.testing.expectError(error.UnexpectedEnd, parse(&.{'1'}));
    try std.testing.expectError(error.LimitExceeded, parse(&(@as([258]u8, @splat(0)))));
    try std.testing.expectError(error.InvalidFormulaNumber, @import("formula_number.zig").parse(&wire(" 19,200")));
}
