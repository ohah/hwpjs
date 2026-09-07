const std = @import("std");
const t = std.testing;
const header = @import("header.zig");
const date = @import("date_time.zig");
const light = @import("pcs_illuminant.zig");
const values = @import("header_v4_values.zig");
fn fixture() !header.Header {
    var b = [_]u8{0} ** 128;
    b[8] = 4;
    b[36..40].* = "acsp".*;
    var h = try header.parse(&b);
    h.creation_date = .{ 2026, 9, 7, 23, 59, 59 };
    h.illuminant = .{ 63190, 65536, 54061 };
    return h;
}
test "ICC date components exhaust all u16 values in each position" {
    const lower = [_]u16{ 0, 1, 1, 0, 0, 0 };
    const upper = [_]u16{ 65535, 12, 31, 23, 59, 59 };
    for (0..6) |i| for (0..65536) |n| {
        var d = [_]u16{ 2026, 9, 7, 12, 30, 45 };
        d[i] = @intCast(n);
        if (n >= lower[i] and n <= upper[i]) try date.validateComponents(d) else try t.expectError(error.InvalidIccDateTime, date.validateComponents(d));
    };
    // Component-range success does not assert Gregorian date existence.
    try date.validateComponents(.{ 1900, 2, 29, 0, 0, 0 });
    try t.expectError(error.InvalidIccDateTime, date.validateComponents(.{ 2000, 1, 1, 0, 0, 60 }));
}
test "ICC D50 rounded acceptance uses independent floating point oracle" {
    const targets = [_]f64{ 0.9642, 1.0, 0.8249 };
    for (0..3) |i| for (0..131073) |n| {
        var v = [_]i32{ 63190, 65536, 54061 };
        v[i] = @intCast(n);
        const rounded = @round((@as(f64, @floatFromInt(n)) / 65536.0) * 10000.0) / 10000.0;
        if (rounded == targets[i]) try light.validateV4(v) else try t.expectError(error.InvalidIccIlluminant, light.validateV4(v));
    };
    for (0..3) |i| for ([_]i32{ -1, std.math.minInt(i32), std.math.maxInt(i32) }) |n| {
        var v = [_]i32{ 63190, 65536, 54061 };
        v[i] = n;
        try t.expectError(error.InvalidIccIlluminant, light.validateV4(v));
    };
}
test "ICC v4 header attributes intent reserved tail and flag ownership" {
    const original = try fixture();
    _ = try values.inspect(original);
    for (0..64) |bit| {
        var h = original;
        h.attributes = @as(u64, 1) << @intCast(bit);
        if (bit >= 4 and bit < 32) try t.expectError(error.InvalidIccAttributes, values.inspect(h)) else {
            const r = try values.inspect(h);
            try t.expectEqual(h.attributes, (@as(u64, r.vendor_attributes) << 32) | @as(u64, r.media_attributes));
        }
    }
    for (0..32) |bit| {
        var h = original;
        h.flags = @as(u32, 1) << @intCast(bit);
        const r = try values.inspect(h);
        try t.expectEqual(h.flags, (@as(u32, r.vendor_flags) << 16) | @as(u32, r.unassigned_icc_flags) | (@as(u32, @intFromBool(r.independent_use_prohibited)) << 1) | @intFromBool(r.embedded));
        h.rendering_intent = @as(u32, 1) << @intCast(bit);
        if (bit < 2) _ = try values.inspect(h) else try t.expectError(error.InvalidIccRenderingIntent, values.inspect(h));
    }
    for (0..256) |n| {
        var h = original;
        h.rendering_intent = @intCast(n);
        if (n <= 3) _ = try values.inspect(h) else try t.expectError(error.InvalidIccRenderingIntent, values.inspect(h));
    }
    for (0..28) |i| for (1..256) |n| {
        var h = original;
        h.tail.v4.reserved[i] = @intCast(n);
        try t.expectError(error.InvalidIccHeaderReserved, values.inspect(h));
    };
    var h = original;
    h.version.major = 2;
    try t.expectError(error.IccEditionMismatch, values.inspect(h));
    h = original;
    h.tail = .{ .v2 = [_]u8{0} ** 44 };
    try t.expectError(error.IccEditionMismatch, values.inspect(h));
    h = original;
    h.creation_date[5] = 60;
    try t.expectError(error.InvalidIccDateTime, values.inspect(h));
    h = original;
    h.illuminant[1] = 0;
    try t.expectError(error.InvalidIccIlluminant, values.inspect(h));
    h = original;
    h.attributes = 0xffffffff0000000f;
    h.flags = 0xffffffff;
    h.rendering_intent = 3;
    const before = h;
    const result = try values.inspect(h);
    try t.expectEqual(@as(u32, 0xffffffff), result.vendor_attributes);
    try t.expectEqual(@as(u16, 0xfffc), result.unassigned_icc_flags);
    try t.expectEqualDeep(before, h);
    h.rendering_intent = 0xffffffff;
    try t.expectError(error.InvalidIccRenderingIntent, values.inspect(h));
}
