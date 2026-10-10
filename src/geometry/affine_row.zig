//! Six row-major coefficients shared by source-format adapters.
const std = @import("std");
pub const Matrix = [6]f64;
// Keep the existing public HWPX error name while sharing the numeric contract.
pub fn finite(matrix: Matrix) !Matrix {
    for (matrix) |value| if (!std.math.isFinite(value)) return error.NonFinitePictureMatrix;
    return matrix;
}
pub fn multiply(left: Matrix, right: Matrix) !Matrix {
    _ = try finite(left);
    _ = try finite(right);
    return finite(.{
        left[0] * right[0] + left[1] * right[3],
        left[0] * right[1] + left[1] * right[4],
        left[0] * right[2] + left[1] * right[5] + left[2],
        left[3] * right[0] + left[4] * right[3],
        left[3] * right[1] + left[4] * right[4],
        left[3] * right[2] + left[4] * right[5] + left[5],
    });
}
pub fn transformPoint(matrix: Matrix, point: [2]f64) ![2]f64 {
    _ = try finite(matrix);
    for (point) |value| if (!std.math.isFinite(value)) return error.NonFinitePictureMatrix;
    const result = [2]f64{ matrix[0] * point[0] + matrix[1] * point[1] + matrix[2], matrix[3] * point[0] + matrix[4] * point[1] + matrix[5] };
    for (result) |value| if (!std.math.isFinite(value)) return error.NonFinitePictureMatrix;
    return result;
}
