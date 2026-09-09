const Table = @import("quantization.zig").Table;
const zigzag = @import("zigzag.zig");

/// Exact signed multiplication, no clamping or floating-point rounding.
/// Both coefficients and parsed immutable table values are in wire order;
/// output is an 8x8 row-major coefficient matrix, NOT reconstructed pixels.
/// i64 holds every i32 coefficient multiplied by every nonzero u16 value.
pub fn block(coefficients: [64]i32, table: Table) [64]i64 {
    var result: [64]i64 = undefined;
    for (zigzag.wire_at_raster, 0..) |wire, raster| {
        result[raster] = @as(i64, coefficients[wire]) * table.value(wire).?;
    }
    return result;
}
