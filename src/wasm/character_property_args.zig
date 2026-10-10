//! Decode the basic public property mask without interpreting omitted fields.
const properties = @import("../model/character_properties.zig");

pub fn decode(mask: u32, size: i32, bold: u32, italic: u32) !properties.Patch {
    if (mask & ~@as(u32, 7) != 0 or (mask & 2 != 0 and bold > 1) or (mask & 4 != 0 and italic > 1)) return error.InvalidCharacterProperties;
    const patch: properties.Patch = .{
        .size = if (mask & 1 != 0) size else null,
        .bold = if (mask & 2 != 0) bold == 1 else null,
        .italic = if (mask & 4 != 0) italic == 1 else null,
    };
    try properties.validate(patch);
    return patch;
}

test "character property ABI mask preserves omission and explicit false" {
    const std = @import("std");
    try std.testing.expectEqualDeep(properties.Patch{}, try decode(0, -1, 99, 99));
    try std.testing.expectEqualDeep(properties.Patch{ .size = 0, .bold = false, .italic = true }, try decode(7, 0, 0, 1));
    try std.testing.expectError(error.InvalidCharacterProperties, decode(8, 0, 0, 0));
    try std.testing.expectError(error.InvalidCharacterProperties, decode(2, 0, 2, 0));
    try std.testing.expectError(error.InvalidCharacterProperties, decode(4, 0, 0, 2));
    try std.testing.expectError(error.InvalidCharacterSize, decode(1, -1, 0, 0));
    try std.testing.expectError(error.InvalidCharacterSize, decode(1, 409601, 0, 0));
}
