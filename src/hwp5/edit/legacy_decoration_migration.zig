//! One owned CHAR_SHAPE migration draft, never a document/header version change.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Shape = @import("../docinfo/char_shape.zig").CharShape;

/// The caller must explicitly resolve the new border default against DocInfo.
/// Full container/version migration is intentionally outside this codec.
pub fn prepare(a: std.mem.Allocator, source: []const u8, from: Version, to: Version, absent_border_default: ?u16, limit: usize) ![]u8 {
    if (to.raw != 0x05000300 or from.raw > to.raw) return error.UnsupportedDecorationMigrationTarget;
    const shape = try Shape.parse(source, from);
    if (!@import("character_decoration_compat.zig").legacyStrike(shape.underlineKindRaw(), shape.strikeKindRaw())) return error.NotLegacyCharacterDecoration;
    if (shape.extra.len != 0 or shape.unresolved_tail != null) return error.UnsupportedCharacterMigrationTail;
    const border = if (shape.border_fill_id) |id| blk: {
        if (absent_border_default != null) return error.UnexpectedCharacterMigrationDefault;
        break :blk id;
    } else absent_border_default orelse return error.MissingCharacterMigrationDefault;
    if (Shape.independent_strike_size > limit) return error.LimitExceeded;
    const out = try a.alloc(u8, Shape.independent_strike_size);
    @memcpy(out[0..Shape.base_size], source[0..Shape.base_size]);
    const flags = (shape.attributes & ~@as(u32, 3 << 2 | 7 << 18 | 15 << 26)) | (1 << 18) | (@as(u32, shape.underlineStyleRaw()) << 26);
    std.mem.writeInt(u32, out[Shape.attributes_offset..][0..4], flags, .little);
    std.mem.writeInt(u16, out[Shape.border_fill_offset..][0..2], border, .little);
    std.mem.writeInt(u32, out[Shape.strike_color_offset..][0..4], shape.underline_color, .little);
    return out;
}
