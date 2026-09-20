pub const compressed_mask: u16 = 0x4000;
pub const relative_mask: u16 = 0x0800;
pub const solid_color_mask: u16 = 0x8000;
pub const effect_mask: u16 = 0x2000;
pub const post_multiply_mask: u16 = 0x2000;

pub fn isCompressed(flags: u16) bool {
    return flags & compressed_mask != 0;
}

pub fn isRelative(flags: u16) bool {
    return flags & relative_mask != 0;
}

pub fn isSolidColor(flags: u16) bool {
    return flags & solid_color_mask != 0;
}

pub fn hasEffect(flags: u16) bool {
    return flags & effect_mask != 0;
}

pub fn closesFigure(flags: u16) bool {
    return flags & effect_mask != 0;
}

pub fn isPostMultiply(flags: u16) bool {
    return flags & post_multiply_mask != 0;
}

pub fn objectId(flags: u16) !u6 {
    const raw: u8 = @truncate(flags);
    if (raw > 63) return error.InvalidEmfPlusObjectId;
    return @intCast(raw);
}

test "EMF+ record flags preserve reserved bits while decoding C and ObjectID" {
    const std = @import("std");
    try std.testing.expect(!isCompressed(0xbf3f));
    try std.testing.expect(isCompressed(0xff3f));
    try std.testing.expect(!isRelative(0xf73f));
    try std.testing.expect(isRelative(0xff3f));
    try std.testing.expect(!isSolidColor(0x7f3f));
    try std.testing.expect(isSolidColor(0xff3f));
    try std.testing.expect(!hasEffect(0xdf3f));
    try std.testing.expect(hasEffect(0xff3f));
    try std.testing.expect(!closesFigure(0xdf3f));
    try std.testing.expect(closesFigure(0xff3f));
    try std.testing.expect(!isPostMultiply(0xdf3f));
    try std.testing.expect(isPostMultiply(0xff3f));
    try std.testing.expectEqual(effect_mask, post_multiply_mask);
    try std.testing.expectEqual(@as(u6, 63), try objectId(0xff3f));
    try std.testing.expectEqual(@as(u6, 0), try objectId(0xff00));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, objectId(0x0040));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, objectId(0xffff));
}
