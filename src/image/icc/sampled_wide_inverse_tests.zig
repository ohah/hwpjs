const std = @import("std");
const t = std.testing;
const api = @import("sampled_inverse.zig");
fn expectRatio(value: api.ExtendedFraction, n: u1024, d: u1024) !void {
    try t.expect(value.denominator > 0 and value.numerator <= value.denominator);
    try t.expectEqual(@as(u2048, n) * value.denominator, @as(u2048, value.numerator) * d);
}
test "sampled wide inverse preserves full target precision and outputs above 512 bits" {
    const data = [_]u8{ 0, 0, 255, 255 };
    const max = std.math.maxInt(u512);
    const out = try api.invertWide(.{ .data = &data }, max - 1, max);
    try expectRatio(out, max - 1, max);
    try t.expect(out.denominator > max);
    try t.expect(out.numerator > max);
    try expectRatio(try api.invertWide(.{ .data = &data }, 1, max), 1, max);
}
test "sampled wide inverse reuses endpoint and interior plateau choices in both directions" {
    const up = [_]u8{ 0, 0, 0, 0, 128, 0, 128, 0, 255, 255, 255, 255 };
    const down = [_]u8{ 255, 255, 255, 255, 128, 0, 128, 0, 0, 0, 0, 0 };
    for ([_][]const u8{ &up, &down }, 0..) |data, i| {
        try expectRatio(try api.invertWide(.{ .data = data }, 0, 1), if (i == 0) 1 else 4, 5);
        try expectRatio(try api.invertWide(.{ .data = data }, 1, 1), if (i == 0) 4 else 1, 5);
        try expectRatio(try api.invertWide(.{ .data = data }, 32768, 65535), 3, 5);
    }
    const narrow = [_]u8{ 0, 100, 0, 200 };
    try expectRatio(try api.invertWide(.{ .data = &narrow }, 0, 1), 0, 1);
    try expectRatio(try api.invertWide(.{ .data = &narrow }, 1, 1), 1, 1);
}
test "sampled wide inverse validates target and entire sample sequence" {
    const odd = [_]u8{ 0, 0, 1 };
    const nonmono = [_]u8{ 0, 0, 255, 255, 0, 0 };
    const flat = [_]u8{ 0, 1, 0, 1 };
    try t.expectError(error.InvalidIccCurveCoordinate, api.invertWide(.{ .data = &odd }, 0, 0));
    try t.expectError(error.InvalidIccCurveCoordinate, api.invertWide(.{ .data = &odd }, 2, 1));
    try t.expectError(error.InvalidIccInverseSamples, api.invertWide(.{ .data = &odd }, 0, 1));
    try t.expectError(error.NonMonotonicIccCurve, api.invertWide(.{ .data = &nonmono }, 0, 1));
    try t.expectError(error.ConstantIccCurve, api.invertWide(.{ .data = &flat }, 0, 1));
}
test "sampled wide inverse agrees exactly with existing normalized inverse" {
    const data = [_]u8{ 255, 255, 128, 0, 0, 0 };
    const max = std.math.maxInt(u128);
    for ([_]u128{ 0, 1, max / 2, max - 1, max }) |n| {
        const old = try api.invertNormalized(.{ .data = &data }, n, max);
        const wide = try api.invertWide(.{ .data = &data }, n, max);
        try t.expectEqual(@as(u1024, old.numerator), wide.numerator);
        try t.expectEqual(@as(u1024, old.denominator), wide.denominator);
    }
}
