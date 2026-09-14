const std = @import("std");

pub const size = 10;
pub const Panose = struct { raw: *const [size]u8, ignored: bool };
const maxima = [size]u8{ 5, 15, 11, 9, 9, 8, 11, 15, 13, 7 };

pub fn parse(bytes: []const u8) !Panose {
    if (bytes.len != size) return error.InvalidEmfPanoseSize;
    const raw: *const [size]u8 = bytes[0..size];
    var all_zero = true;
    for (raw, maxima) |value, maximum| {
        all_zero = all_zero and value == 0;
        if (value > maximum) return error.InvalidEmfPanoseValue;
    }
    return .{ .raw = raw, .ignored = all_zero };
}

test "Panose validates all ten independent enum ranges" {
    var bytes = maxima;
    const value = try parse(&bytes);
    try std.testing.expect(!value.ignored);
    for (0..size) |index| {
        bytes = [_]u8{0} ** size;
        bytes[index] = maxima[index] + 1;
        try std.testing.expectError(error.InvalidEmfPanoseValue, parse(&bytes));
    }
    bytes = [_]u8{0} ** size;
    try std.testing.expect((try parse(&bytes)).ignored);
}
