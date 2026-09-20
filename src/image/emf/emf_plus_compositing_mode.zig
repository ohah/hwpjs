pub const CompositingMode = enum(u8) {
    source_over = 0,
    source_copy = 1,

    pub fn parse(raw: u8) !CompositingMode {
        if (raw > @intFromEnum(CompositingMode.source_copy)) return error.InvalidEmfPlusCompositingMode;
        return @enumFromInt(raw);
    }
};

test "EMF+ CompositingMode accepts exactly the official domain" {
    const std = @import("std");
    try std.testing.expectEqual(CompositingMode.source_over, try CompositingMode.parse(0));
    try std.testing.expectEqual(CompositingMode.source_copy, try CompositingMode.parse(1));
    try std.testing.expectError(error.InvalidEmfPlusCompositingMode, CompositingMode.parse(2));
    try std.testing.expectError(error.InvalidEmfPlusCompositingMode, CompositingMode.parse(0xff));
}
