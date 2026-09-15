const std = @import("std");

pub const Identifier = enum(u32) {
    emf_spool = 0x00000000,
    emf_plus = 0x2b464d45,
    public = 0x43494447,
};

pub fn parse(raw: u32) ?Identifier {
    return std.enums.fromInt(Identifier, raw);
}

test "comment identifiers distinguish every predefined value from private data" {
    try std.testing.expectEqual(Identifier.emf_spool, parse(0).?);
    try std.testing.expectEqual(Identifier.emf_plus, parse(0x2b464d45).?);
    try std.testing.expectEqual(Identifier.public, parse(0x43494447).?);
    for ([_]u32{ 1, 0x2b464d44, 0x2b464d46, 0x43494446, 0x43494448, std.math.maxInt(u32) }) |raw|
        try std.testing.expectEqual(@as(?Identifier, null), parse(raw));
}
