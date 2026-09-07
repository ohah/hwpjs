const std = @import("std");
const t = std.testing;
const id = @import("profile_id.zig");
fn fixture() [132]u8 {
    var bytes: [132]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[0..4], 132, .big);
    bytes[8..12].* = .{ 4, 0x40, 0, 0 };
    bytes[36..40].* = "acsp".*;
    return bytes;
}
test "ICC v4 ID independent Node digest and all masked byte mutations" {
    var bytes = fixture();
    // Node crypto.createHash('md5') over the independent 132-byte zero-ID fixture.
    const expected = [_]u8{ 0x5b, 0x35, 0x1c, 0xd6, 0xea, 0x91, 0xc5, 0xdf, 0x5c, 0xda, 0x03, 0x61, 0x2c, 0x0f, 0x47, 0xad };
    try t.expectEqualDeep(expected, try id.calculate(&bytes, bytes.len));
    try t.expectEqual(id.Status.not_calculated, try id.inspect(&bytes, bytes.len));
    bytes[84..100].* = expected;
    try t.expectEqual(id.Status.verified, try id.inspect(&bytes, bytes.len));
    for ([_]usize{ 44, 45, 46, 47, 64, 65, 66, 67 }) |at| for (0..256) |value| {
        var changed = bytes;
        changed[at] = @intCast(value);
        const before = changed;
        try t.expectEqual(id.Status.verified, try id.inspect(&changed, changed.len));
        try t.expectEqualDeep(before, changed);
    };
    for (84..100) |at| for (0..256) |value| {
        var changed = bytes;
        changed[at] = @intCast(value);
        try t.expectEqualDeep(expected, try id.calculate(&changed, changed.len));
        if (changed[at] == bytes[at]) {
            try t.expectEqual(id.Status.verified, try id.inspect(&changed, changed.len));
        } else try t.expectError(error.InvalidIccProfileId, id.inspect(&changed, changed.len));
    };
    for ([_]usize{ 4, 12, 16, 20, 24, 40, 48, 52, 56, 68, 80, 100, 127, 128, 131 }) |at| {
        var changed = bytes;
        changed[at] ^= 1;
        try t.expectError(error.InvalidIccProfileId, id.inspect(&changed, changed.len));
    }
}
test "ICC ID v2 reserved tail is not a digest and extent is independently bounded" {
    var bytes = fixture();
    bytes[8] = 2;
    @memset(bytes[84..128], 0xff);
    try t.expectEqual(id.Status.not_defined, try id.inspect(&bytes, bytes.len));
    try t.expectError(error.UnsupportedIccProfileId, id.calculate(&bytes, bytes.len));
    for (0..132) |len| try t.expectError(error.InvalidIccProfileSize, id.inspect(bytes[0..len], bytes.len));
    try t.expectError(error.LimitExceeded, id.inspect(&bytes, bytes.len - 1));
    for ([_]u32{ 0, 128, 131, 133, 0xffffffff }) |size| {
        std.mem.writeInt(u32, bytes[0..4], size, .big);
        try t.expectError(error.InvalidIccProfileSize, id.inspect(&bytes, bytes.len));
    }
}
