const std = @import("std");
const t = std.testing;
const header = @import("header.zig");
const values = @import("header_v2_values.zig");
const light = @import("pcs_illuminant.zig");
fn fixture() !header.Header {
    var bytes = [_]u8{0} ** 128;
    bytes[8] = 2;
    bytes[36..40].* = "acsp".*;
    var h = try header.parse(&bytes);
    h.creation_date = .{ 2026, 9, 7, 23, 59, 59 };
    h.illuminant = .{ 63190, 65536, 54061 };
    return h;
}
test "ICC v2 reports reserved and high bits instead of silently applying v4 rules" {
    const base = try fixture();
    for (0..32) |bit| {
        var h = base;
        h.rendering_intent = @as(u32, 1) << @intCast(bit);
        if (bit >= 2 and bit < 16) try t.expectError(error.InvalidIccRenderingIntent, values.inspect(h, .nearest_encoding)) else {
            const r = try values.inspect(h, .nearest_encoding);
            try t.expectEqual(h.rendering_intent, (@as(u32, r.intent_high_bits) << 16) | @as(u32, r.rendering_intent));
        }
        h = base;
        h.flags = @as(u32, 1) << @intCast(bit);
        const f = (try values.inspect(h, .nearest_encoding)).flags;
        try t.expectEqual(h.flags, (@as(u32, f.vendor_flags) << 16) | @as(u32, f.unassigned_icc_flags) | (@as(u32, @intFromBool(f.independent_use_prohibited)) << 1) | @intFromBool(f.embedded));
    }
    for (0..64) |bit| {
        var h = base;
        h.attributes = @as(u64, 1) << @intCast(bit);
        const a = (try values.inspect(h, .nearest_encoding)).attributes;
        try t.expectEqual(h.attributes, (@as(u64, a.vendor_attributes) << 32) | @as(u64, a.unassigned_icc_attributes) | @as(u64, a.media_attributes));
    }
    for (0..44) |at| for (1..256) |n| {
        var h = base;
        h.tail.v2[at] = @intCast(n);
        try t.expectEqual(@as(u8, 1), (try values.inspect(h, .nearest_encoding)).nonzero_reserved_bytes);
    };
    var h = base;
    h.tail.v2 = [_]u8{255} ** 44;
    try t.expectEqual(@as(u8, 44), (try values.inspect(h, .nearest_encoding)).nonzero_reserved_bytes);
    h.creation_date[5] = 60;
    try t.expectError(error.InvalidIccDateTime, values.inspect(h, .nearest_encoding));
    h = base;
    h.version.major = 4;
    try t.expectError(error.IccEditionMismatch, values.inspect(h, .nearest_encoding));
    h = base;
    h.tail = .{ .v4 = .{ .profile_id = [_]u8{0} ** 16, .reserved = [_]u8{0} ** 28 } };
    try t.expectError(error.IccEditionMismatch, values.inspect(h, .nearest_encoding));
}
test "ICC v2 explicit D50 policies compare independent numeric expectations" {
    const target = [_]f64{ 0.9642, 1.0, 0.8249 };
    for ([_]values.IlluminantPolicy{ .nearest_encoding, .rounded_four_decimals }) |policy| {
        for (0..3) |axis| for (0..33) |index| {
            var v = [_]i32{ 63190, 65536, 54061 };
            v[axis] += @as(i32, @intCast(index)) - 16;
            const raw: f64 = @floatFromInt(v[axis]);
            const ok = if (policy == .nearest_encoding) raw == @round(target[axis] * 65536) else @round(raw / 65536 * 10000) == @round(target[axis] * 10000);
            if (ok) try light.validateV2(v, policy) else try t.expectError(error.InvalidIccIlluminant, light.validateV2(v, policy));
        };
    }
}
