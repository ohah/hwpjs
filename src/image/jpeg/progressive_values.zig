const std = @import("std");
const Bits = @import("entropy_bits.zig").Bits;

pub fn scale(value: i32, step: i32) !i32 {
    return std.math.mul(i32, value, step) catch error.InvalidJpegProgressiveCoefficient;
}

/// Prior approximation has no bits at or below the new bit position.
pub fn validatePrior(value: i32, step: i32) !void {
    if (@rem(value, step * 2) != 0) return error.InvalidJpegProgressiveCoefficient;
}

/// DC uses two's-complement bit append; a negative DC may move toward zero.
pub fn refineDc(bits: *Bits, value: i32, step: i32) !i32 {
    return if (try bits.read(1) == 0) value else value | step;
}

/// AC correction increases magnitude, unlike DC bit append.
pub fn refineAc(bits: *Bits, value: i32, step: i32) !i32 {
    if (try bits.read(1) == 0) return value;
    return std.math.add(i32, value, if (value > 0) step else -step) catch error.InvalidJpegProgressiveCoefficient;
}
