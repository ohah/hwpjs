pub const UnitType = enum(u32) {
    world = 0,
    display = 1,
    pixel = 2,
    point = 3,
    inch = 4,
    document = 5,
    millimeter = 6,

    pub fn parse(raw: u32) !UnitType {
        return switch (raw) {
            0...6 => @enumFromInt(raw),
            else => error.InvalidEmfPlusUnitType,
        };
    }
};

test "EMF+ UnitType accepts exactly the seven shared units" {
    const std = @import("std");
    inline for (0..7) |raw| _ = try UnitType.parse(raw);
    try std.testing.expectEqual(UnitType.millimeter, try UnitType.parse(6));
    try std.testing.expectError(error.InvalidEmfPlusUnitType, UnitType.parse(7));
    try std.testing.expectError(error.InvalidEmfPlusUnitType, UnitType.parse(std.math.maxInt(u32)));
}
