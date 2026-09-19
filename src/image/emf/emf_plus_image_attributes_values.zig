pub const ObjectClamp = enum(i32) {
    rectangle = 0,
    bitmap = 1,

    pub fn parse(raw: i32) !ObjectClamp {
        return switch (raw) {
            0, 1 => @enumFromInt(raw),
            else => error.InvalidEmfPlusObjectClamp,
        };
    }
};

test "EMF+ ObjectClamp accepts only rectangle and bitmap" {
    const std = @import("std");
    try std.testing.expectEqual(ObjectClamp.rectangle, try ObjectClamp.parse(0));
    try std.testing.expectEqual(ObjectClamp.bitmap, try ObjectClamp.parse(1));
    try std.testing.expectError(error.InvalidEmfPlusObjectClamp, ObjectClamp.parse(-1));
    try std.testing.expectError(error.InvalidEmfPlusObjectClamp, ObjectClamp.parse(2));
    try std.testing.expectError(error.InvalidEmfPlusObjectClamp, ObjectClamp.parse(std.math.maxInt(i32)));
}
