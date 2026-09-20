const std = @import("std");

pub const CombineMode = enum(u4) {
    replace = 0,
    intersect = 1,
    union_mode = 2,
    xor = 3,
    exclude = 4,
    complement = 5,

    pub fn parse(raw: u4) !CombineMode {
        return switch (raw) {
            0...5 => @enumFromInt(raw),
            else => error.InvalidEmfPlusCombineMode,
        };
    }
};

test "EMF+ CombineMode accepts exactly the six logical operations" {
    inline for (0..6) |raw|
        try std.testing.expectEqual(@as(u4, @intCast(raw)), @intFromEnum(try CombineMode.parse(raw)));
    inline for (6..16) |raw|
        try std.testing.expectError(error.InvalidEmfPlusCombineMode, CombineMode.parse(raw));
}
