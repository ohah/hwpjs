const Bits = @import("entropy_bits.zig").Bits;

/// T.81 EXTEND, not two's-complement sign extension. Process-specific category
/// limits and lossless category-16 handling belong to the coding model.
pub fn extend(value: u32, width: u8) !i32 {
    if (width > 16) return error.InvalidJpegMagnitudeWidth;
    const limit = @as(u32, 1) << @as(u5, @intCast(width));
    if (value >= limit) return error.InvalidJpegMagnitudeValue;
    if (width == 0) return 0;
    const unsigned: i32 = @intCast(value);
    return if (value < limit / 2) unsigned - @as(i32, @intCast(limit - 1)) else unsigned;
}

/// Reads only the amplitude bits; it does not consume a Huffman symbol or update
/// a predictor. Any failure preserves the entire bit-reader state.
pub fn receive(bits: *Bits, width: u8) !i32 {
    if (width > 16) return error.InvalidJpegMagnitudeWidth;
    var next = bits.*;
    const result = try extend(try next.read(@intCast(width)), width);
    bits.* = next;
    return result;
}
