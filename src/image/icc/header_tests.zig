const std = @import("std");
const t = std.testing;
const version = @import("version.zig");
const header = @import("header.zig");
fn fixture(major: u8) [128]u8 {
    var bytes: [128]u8 = undefined;
    for (&bytes, 0..) |*b, i| b.* = @intCast(i);
    bytes[8..12].* = .{ major, 0x40, 0, 0 };
    bytes[36..40].* = "acsp".*;
    return bytes;
}
test "ICC header all fields retain distinct big endian values and owned tails" {
    var bytes = fixture(4);
    const h = try header.parse(&bytes);
    try t.expectEqual(@as(u32, 0x00010203), h.profile_size);
    try t.expectEqualSlices(u8, &.{ 4, 5, 6, 7 }, &h.preferred_cmm);
    try t.expectEqualDeep(version.Version{ .major = 4, .minor = 4, .bugfix = 0 }, h.version);
    try t.expectEqualSlices(u8, &.{ 12, 13, 14, 15 }, &h.profile_class);
    try t.expectEqualSlices(u8, &.{ 16, 17, 18, 19 }, &h.data_space);
    try t.expectEqualSlices(u8, &.{ 20, 21, 22, 23 }, &h.pcs);
    try t.expectEqualSlices(u16, &.{ 0x1819, 0x1a1b, 0x1c1d, 0x1e1f, 0x2021, 0x2223 }, &h.creation_date);
    try t.expectEqualStrings("acsp", &h.file_signature);
    try t.expectEqualSlices(u8, &.{ 40, 41, 42, 43 }, &h.platform);
    try t.expectEqual(@as(u32, 0x2c2d2e2f), h.flags);
    try t.expectEqualSlices(u8, &.{ 48, 49, 50, 51 }, &h.manufacturer);
    try t.expectEqualSlices(u8, &.{ 52, 53, 54, 55 }, &h.model);
    try t.expectEqual(@as(u64, 0x38393a3b3c3d3e3f), h.attributes);
    try t.expectEqual(@as(u32, 0x40414243), h.rendering_intent);
    try t.expectEqualSlices(i32, &.{ 0x44454647, 0x48494a4b, 0x4c4d4e4f }, &h.illuminant);
    try t.expectEqualSlices(u8, &.{ 80, 81, 82, 83 }, &h.creator);
    try t.expectEqualSlices(u8, bytes[84..100], &h.tail.v4.profile_id);
    try t.expectEqualSlices(u8, bytes[100..128], &h.tail.v4.reserved);
    @memset(&bytes, 0);
    try t.expectEqual(@as(u8, 84), h.tail.v4.profile_id[0]);
    try t.expectEqual(@as(u8, 127), h.tail.v4.reserved[27]);
    const old = fixture(2);
    const v2 = try header.parse(&old);
    try t.expectEqualSlices(u8, old[84..128], &v2.tail.v2);
}
test "ICC version exhaustive BCD nibbles major families and reserved bytes" {
    for (0..256) |major| for (0..256) |minor| {
        const bytes = [_]u8{ @intCast(major), @intCast(minor), 0, 0 };
        const valid_bcd = major >> 4 <= 9 and major & 15 <= 9 and minor >> 4 <= 9 and minor & 15 <= 9;
        if (!valid_bcd) {
            try t.expectError(error.InvalidIccVersionBcd, version.parse(&bytes));
        } else if (major != 2 and major != 4) {
            try t.expectError(error.UnsupportedIccVersion, version.parse(&bytes));
        } else {
            const v = try version.parse(&bytes);
            try t.expectEqual(major, v.major);
            try t.expectEqual(minor >> 4, v.minor);
            try t.expectEqual(minor & 15, v.bugfix);
        }
    };
    for (2..4) |at| for (1..256) |value| {
        var bytes = [_]u8{ 4, 0x40, 0, 0 };
        bytes[at] = @intCast(value);
        try t.expectError(error.InvalidIccVersionReserved, version.parse(&bytes));
    };
    for (0..4) |len| try t.expectError(error.InvalidIccVersionSize, version.parse((&[_]u8{ 4, 0x40, 0, 0 })[0..len]));
    try t.expectError(error.InvalidIccVersionSize, version.parse(&.{ 4, 0x40, 0, 0, 0 }));
}
test "ICC header exact length signature and signed fixed point boundaries" {
    var bytes = fixture(4);
    for (0..128) |len| try t.expectError(error.InvalidIccHeaderSize, header.parse(bytes[0..len]));
    try t.expectError(error.InvalidIccHeaderSize, header.parse(&(bytes ++ [_]u8{0})));
    for (36..40) |at| for (0..256) |value| {
        var bad = bytes;
        bad[at] = @intCast(value);
        if (value == bytes[at]) _ = try header.parse(&bad) else try t.expectError(error.InvalidIccSignature, header.parse(&bad));
    };
    for ([_]i32{ std.math.minInt(i32), -1, 0, 65536, std.math.maxInt(i32) }) |value| for (0..3) |i| {
        var changed = bytes;
        std.mem.writeInt(i32, changed[68 + i * 4 ..][0..4], value, .big);
        const h = try header.parse(&changed);
        try t.expectEqual(value, h.illuminant[i]);
    };
    bytes[8] = 2;
    @memset(bytes[84..128], 0);
    const old = try header.parse(&bytes);
    try t.expectEqual(@as(usize, 44), old.tail.v2.len);
    bytes[8] = 4;
    const modern = try header.parse(&bytes);
    try t.expectEqualSlices(u8, &([_]u8{0} ** 16), &modern.tail.v4.profile_id);
}
