pub const compressed_mask: u16 = 0x4000;

pub fn isCompressed(flags: u16) bool {
    return flags & compressed_mask != 0;
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
    try std.testing.expectEqual(@as(u6, 63), try objectId(0xff3f));
    try std.testing.expectEqual(@as(u6, 0), try objectId(0xff00));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, objectId(0x0040));
    try std.testing.expectError(error.InvalidEmfPlusObjectId, objectId(0xffff));
}
