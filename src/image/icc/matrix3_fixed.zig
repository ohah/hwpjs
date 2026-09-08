/// Exact determinant numerator for row-major signed 16.16 coefficients.
/// Six triple products of i32 fit within i128 (absolute sum <= 6 * 2^93).
/// The determinant scale is 65536^3. No floating-point tolerance is used.
pub fn determinantNumerator(values: [9]i32) i128 {
    var result: i128 = 0;
    for (0..3) |column| result += @as(i128, values[column]) * cofactor(values, 0, column);
    return result;
}
/// Signed cofactor, not transposed. Row and column must be in 0..3.
/// Cyclic ordering of the remaining rows/columns includes the cofactor sign.
/// Each product has magnitude <= 2^62; the difference fits i128.
pub fn cofactor(values: [9]i32, row: usize, column: usize) i128 {
    const r1 = (row + 1) % 3;
    const r2 = (row + 2) % 3;
    const c1 = (column + 1) % 3;
    const c2 = (column + 2) % 3;
    return @as(i128, values[r1 * 3 + c1]) * values[r2 * 3 + c2] -
        @as(i128, values[r1 * 3 + c2]) * values[r2 * 3 + c1];
}
