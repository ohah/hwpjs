const std = @import("std");
const h = @import("root.zig");
const a = std.testing.allocator;

fn header() h.Header {
    var bytes = [_]u8{0} ** 256;
    @memcpy(bytes[0..17], "HWP Document File");
    bytes[35] = 5;
    return h.Header.parse(&bytes) catch unreachable;
}

test "HWP5 header exact size signature flags and raw preservation" {
    var value = header();
    for (0..256) |n| try std.testing.expectError(error.InvalidHeaderSize, h.Header.parse(value.raw[0..n]));
    try std.testing.expectError(error.InvalidHeaderSize, h.Header.parse(&([_]u8{0} ** 257)));
    for (0..32) |i| {
        var bad = value.raw;
        bad[i] ^= 1;
        try std.testing.expectError(error.InvalidSignature, h.Header.parse(&bad));
    }
    for (0..32) |bit| {
        std.mem.writeInt(u32, value.raw[36..40], @as(u32, 1) << @intCast(bit), .little);
        const parsed = try h.Header.parse(&value.raw);
        inline for (@typeInfo(h.Flag).@"enum".fields) |field| {
            try std.testing.expectEqual(bit == field.value, parsed.has(@enumFromInt(field.value)));
        }
        try std.testing.expectEqualSlices(u8, &value.raw, &parsed.raw);
    }
    value.raw[32..36].* = .{ 7, 3, 0, 5 };
    value.raw[40..44].* = .{ 7, 0, 0, 128 };
    value.raw[44..48].* = .{ 4, 0, 0, 0 };
    value.raw[48] = 15;
    value.raw[255] = 99;
    const parsed = try h.Header.parse(&value.raw);
    try std.testing.expectEqual(@as(u8, 3), parsed.version().patch());
    try std.testing.expectEqual(@as(u8, 7), parsed.version().revision());
    try std.testing.expectEqual(@as(u32, 0x80000007), parsed.licenseFlags());
    try std.testing.expect(parsed.hasLicense(.same_condition));
    try std.testing.expectEqual(@as(u32, 4), parsed.encryptVersion());
    try std.testing.expectEqual(@as(u8, 15), parsed.country());
    try std.testing.expectEqualSlices(u8, &value.raw, &parsed.raw);
}

test "HWP5 stream unsupported features never reach decompression" {
    var value = header();
    for ([_]u32{ 0x04000000, 0x05020000, 0x06000000 }) |version| {
        std.mem.writeInt(u32, value.raw[32..36], version, .little);
        try std.testing.expectError(error.UnsupportedVersion, h.stream.decode(a, &value, &.{7}, 0));
    }
    value = header();
    const cases = .{
        .{ h.Flag.encrypted, error.UnsupportedEncryption },
        .{ h.Flag.certificate_encryption, error.UnsupportedEncryption },
        .{ h.Flag.drm, error.UnsupportedDrm },
        .{ h.Flag.certificate_drm, error.UnsupportedDrm },
        .{ h.Flag.distribution, error.UnsupportedDistribution },
    };
    inline for (cases) |case| {
        std.mem.writeInt(u32, value.raw[36..40], 1 | (@as(u32, 1) << @intFromEnum(case[0])), .little);
        try std.testing.expectError(case[1], h.stream.decode(a, &value, &.{7}, 0));
    }
    value = header();
    value.raw[44] = 99;
    const metadata_only = try h.stream.decode(a, &value, "", 0);
    defer a.free(metadata_only);
    value = header();
    try std.testing.expectError(error.LimitExceeded, h.stream.decode(a, &value, "abc", 2));
    const plain = try h.stream.decode(a, &value, "abc", 3);
    defer a.free(plain);
    try std.testing.expectEqualStrings("abc", plain);
}
