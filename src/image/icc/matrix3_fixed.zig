/// Exact determinant numerator for row-major signed 16.16 coefficients.
/// Six triple products of i32 fit within i128 (absolute sum <= 6 * 2^93).
/// The determinant scale is 65536^3. No floating-point tolerance is used.
pub fn determinantNumerator(values: [9]i32) i128 {
    var a: [9]i128 = undefined;
    for (values, 0..) |v, i| a[i] = v;
    return a[0] * (a[4] * a[8] - a[5] * a[7]) -
        a[1] * (a[3] * a[8] - a[5] * a[6]) +
        a[2] * (a[3] * a[7] - a[4] * a[6]);
}
