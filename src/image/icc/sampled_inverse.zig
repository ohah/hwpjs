const std = @import("std");
const Samples = @import("curve_type.zig").Samples;
/// Normalized device coordinate. Exact fraction, not necessarily reduced.
pub const Fraction = struct { numerator: u64, denominator: u64 };
/// ICC.1:2022 Annex F.1, sampled piecewise-linear curves only.
/// y is encoded in 0..65535. Validates the entire curve before returning a result.
pub fn invert(samples: Samples, y: u16) !Fraction {
    const count = samples.count();
    if (samples.data.len % 2 != 0 or count < 2 or count > std.math.maxInt(u32)) return error.InvalidIccInverseSamples;
    var rising = false;
    var falling = false;
    var previous = try samples.at(0);
    for (1..count) |i| {
        const current = try samples.at(i);
        rising = rising or current > previous;
        falling = falling or current < previous;
        previous = current;
    }
    if (rising and falling) return error.NonMonotonicIccCurve;
    if (!rising and !falling) return error.ConstantIccCurve;
    const first = try samples.at(0);
    const last = try samples.at(count - 1);
    // F.1(b): nearest ordinate when the requested y is outside the original range.
    const target = std.math.clamp(y, @min(first, last), @max(first, last));
    const intervals: u64 = @intCast(count - 1);
    var equal_start: ?usize = null;
    var equal_end: usize = 0;
    for (0..count) |i| {
        if (try samples.at(i) == target) {
            if (equal_start == null) equal_start = i;
            equal_end = i;
        }
    }
    if (equal_start) |start| {
        // F.1(a): right edge of interior/start flats, left edge of a terminal flat.
        const index = if (equal_end == count - 1) start else equal_end;
        return .{ .numerator = @intCast(index), .denominator = intervals };
    }
    for (0..count - 1) |i| {
        const a = try samples.at(i);
        const b = try samples.at(i + 1);
        if (target > @min(a, b) and target < @max(a, b)) {
            const span: u64 = @as(u32, @max(a, b)) - @min(a, b);
            const distance: u64 = if (rising) @as(u32, target) - a else @as(u32, a) - target;
            return .{ .numerator = @as(u64, @intCast(i)) * span + distance, .denominator = intervals * span };
        }
    }
    return error.InvalidIccInverseSamples;
}
