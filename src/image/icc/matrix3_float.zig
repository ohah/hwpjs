const std = @import("std");
/// Explicit approximate matrix application. No clipping or PCS quantization.
pub fn forward(matrix: [9]i32, xyz: [3]f64) ![3]f64 {
    @setFloatMode(.strict);
    for (xyz) |x| if (!std.math.isFinite(x)) return error.InvalidIccMatrixCoordinate;
    var out: [3]f64 = @splat(0);
    for (0..3) |row| {
        for (0..3) |column| out[row] += (@as(f64, @floatFromInt(matrix[row * 3 + column])) / 65536.0) * xyz[column];
        if (!std.math.isFinite(out[row])) return error.InvalidIccMatrixResult;
    }
    return out;
}
