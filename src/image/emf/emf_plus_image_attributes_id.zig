pub const ImageAttributesId = struct {
    raw: u32,
    object_id: ?u6,
};

pub fn parse(raw: u32) ImageAttributesId {
    return .{
        .raw = raw,
        .object_id = if (raw <= 63) @intCast(raw) else null,
    };
}

test "EMF+ optional ImageAttributes ID preserves every raw value" {
    const std = @import("std");
    try std.testing.expectEqual(@as(u6, 0), parse(0).object_id.?);
    try std.testing.expectEqual(@as(u6, 63), parse(63).object_id.?);
    try std.testing.expect(parse(64).object_id == null);
    try std.testing.expect(parse(0xffff_fffe).object_id == null);
    const absent = parse(0xffff_ffff);
    try std.testing.expectEqual(@as(u32, 0xffff_ffff), absent.raw);
    try std.testing.expect(absent.object_id == null);
}
