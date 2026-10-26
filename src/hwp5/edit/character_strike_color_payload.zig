//! Strike color only; never convert the version or invent an absent field.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Shape = @import("../docinfo/char_shape.zig").CharShape;

pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, color: u32, limit: usize) ![]u8 {
    if (input.len > limit) return error.LimitExceeded;
    try @import("../../model/rgb_color.zig").validate(color);
    const shape = try Shape.parse(input, version);
    const offset = try colorOffset(shape);
    const output = try a.dupe(u8, input);
    std.mem.writeInt(u32, output[offset..][0..4], @import("../../model/rgb_color.zig").hwp5(color), .little);
    return output;
}

pub fn colorOffset(shape: Shape) !usize {
    if (shape.strikeKindRaw() > 1) return error.UnsupportedCharacterStrikeKind;
    const legacy = @import("character_decoration_compat.zig").legacyStrike(shape.underlineKindRaw(), shape.strikeKindRaw());
    return if (legacy) Shape.underline_color_offset else if (shape.strike_color != null) Shape.strike_color_offset else error.MissingCharacterStrikeColorField;
}
