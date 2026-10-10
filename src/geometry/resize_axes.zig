//! Resize local axes while retaining their directions and one fixed source point.
//! This math does not select a file-format matrix representation or infer sizes.
const std = @import("std");
const affine = @import("affine_row.zig");
pub const Size = [2]u32;

pub fn correction(basis: [2][2]f64, before: [2]f64, after: Size) !affine.Matrix {
    for (before, after) |old, new| if (!std.math.isFinite(old) or old <= 0 or new == 0) return error.InvalidResizeAxisSize;
    const frame = try affine.finite(.{ basis[0][0], basis[1][0], 0, basis[0][1], basis[1][1], 0 });
    const det = frame[0] * frame[4] - frame[1] * frame[3];
    if (!std.math.isFinite(det) or det == 0) return error.DegenerateResizeMatrix;
    if (before[0] == @as(f64, @floatFromInt(after[0])) and before[1] == @as(f64, @floatFromInt(after[1]))) return .{ 1, 0, 0, 0, 1, 0 };
    const x = @as(f64, @floatFromInt(after[0])) / before[0];
    const y = @as(f64, @floatFromInt(after[1])) / before[1];
    // Avoid inverse-roundtrip drift on an unchanged Cartesian axis.
    if (frame[1] == 0 and frame[3] == 0) return affine.finite(.{ x, 0, 0, 0, y, 0 });
    if (frame[0] == 0 and frame[4] == 0) return affine.finite(.{ y, 0, 0, 0, x, 0 });
    const inverse = try affine.finite(.{ frame[4] / det, -frame[1] / det, 0, -frame[3] / det, frame[0] / det, 0 });
    return affine.multiply(try affine.multiply(frame, .{ x, 0, 0, 0, y, 0 }), inverse);
}

pub fn resizeInBasis(matrix: affine.Matrix, fixed_point: [2]f64, change: affine.Matrix) !affine.Matrix {
    _ = try affine.finite(matrix);
    for (fixed_point) |value| if (!std.math.isFinite(value)) return error.NonFinitePictureMatrix;
    const determinant = matrix[0] * matrix[4] - matrix[1] * matrix[3];
    if (!std.math.isFinite(determinant) or determinant == 0) return error.DegenerateResizeMatrix;
    if (std.meta.eql(change, affine.Matrix{ 1, 0, 0, 0, 1, 0 })) return matrix;
    const original_point = try affine.transformPoint(matrix, fixed_point);
    var result = try affine.multiply(matrix, change);
    const resized_point = try affine.transformPoint(result, fixed_point);
    result[2] += original_point[0] - resized_point[0];
    result[5] += original_point[1] - resized_point[1];
    _ = try affine.finite(result);
    const resized_determinant = result[0] * result[4] - result[1] * result[3];
    if (!std.math.isFinite(resized_determinant) or resized_determinant == 0) return error.DegenerateResizeMatrix;
    return result;
}

pub fn resize(matrix: affine.Matrix, fixed_point: [2]f64, before: [2]f64, after: Size) !affine.Matrix {
    _ = try affine.finite(matrix);
    for (fixed_point) |value| if (!std.math.isFinite(value)) return error.NonFinitePictureMatrix;
    for (before, after) |old, new| if (!std.math.isFinite(old) or old <= 0 or new == 0) return error.InvalidResizeAxisSize;
    const determinant = matrix[0] * matrix[4] - matrix[1] * matrix[3];
    if (!std.math.isFinite(determinant) or determinant == 0) return error.DegenerateResizeMatrix;
    if (before[0] == @as(f64, @floatFromInt(after[0])) and before[1] == @as(f64, @floatFromInt(after[1]))) return matrix;
    return resizeInBasis(matrix, fixed_point, try correction(.{ .{ 1, 0 }, .{ 0, 1 } }, before, after));
}

test "axis resize uses skewed original image basis rather than Cartesian axes" {
    const change = try correction(.{ .{ 1, 1 }, .{ -1, 1 } }, .{ 2, 4 }, .{ 4, 2 });
    try std.testing.expectEqualDeep(affine.Matrix{ 1.25, 0.75, 0, 0.75, 1.25, 0 }, change);
    try std.testing.expectEqualDeep([2]f64{ 2, 2 }, try affine.transformPoint(change, .{ 1, 1 }));
    try std.testing.expectEqualDeep([2]f64{ -0.5, 0.5 }, try affine.transformPoint(change, .{ -1, 1 }));
    try std.testing.expectError(error.DegenerateResizeMatrix, correction(.{ .{ 1, 1 }, .{ 2, 2 } }, .{ 2, 4 }, .{ 4, 2 }));
    try std.testing.expectError(error.NonFinitePictureMatrix, correction(.{ .{ std.math.nan(f64), 1 }, .{ -1, 1 } }, .{ 2, 4 }, .{ 4, 2 }));
    try std.testing.expectEqualDeep(affine.Matrix{ 2, 0, 0, 0, 1, 0 }, try correction(.{ .{ 12600, 0 }, .{ 0, 7560 } }, .{ 100, 200 }, .{ 200, 200 }));
    try std.testing.expectEqualDeep(affine.Matrix{ 1, 0, 0, 0, 2, 0 }, try correction(.{ .{ 0, 12600 }, .{ 7560, 0 } }, .{ 100, 200 }, .{ 200, 200 }));
}

test "axis resize preserves rotation shear and fixed source point without changing multiplication order" {
    try std.testing.expectEqualDeep(affine.Matrix{ 0, -1.5, 7, 4, 0, 18 }, try resize(.{ 0, -3, 10, 2, 0, 20 }, .{ 1, 2 }, .{ 10, 20 }, .{ 20, 10 }));
    try std.testing.expectEqualDeep([2]f64{ 4, 22 }, try affine.transformPoint(try resize(.{ 0, -3, 10, 2, 0, 20 }, .{ 1, 2 }, .{ 10, 20 }, .{ 20, 10 }), .{ 1, 2 }));
    try std.testing.expectEqualDeep(affine.Matrix{ 4, 2, 2, 2, 6, 6 }, try resize(.{ 2, 1, 10, 1, 3, 20 }, .{ 2, 4 }, .{ 10, 20 }, .{ 20, 40 }));
}

test "axis resize rejects zero size invalid points singular matrices and keeps no-op coefficients exact" {
    const matrix: affine.Matrix = .{ 1, -0.0, 2, 0, 1, 3 };
    const noop = try resize(matrix, .{ 0, 0 }, .{ 10, 20 }, .{ 10, 20 });
    for (matrix, noop) |before, after| try std.testing.expectEqual(@as(u64, @bitCast(before)), @as(u64, @bitCast(after)));
    try std.testing.expectError(error.InvalidResizeAxisSize, resize(matrix, .{ 0, 0 }, .{ 0, 20 }, .{ 1, 1 }));
    try std.testing.expectError(error.InvalidResizeAxisSize, resize(matrix, .{ 0, 0 }, .{ 10, 20 }, .{ 1, 0 }));
    try std.testing.expectError(error.DegenerateResizeMatrix, resize(.{ 1, 2, 0, 2, 4, 0 }, .{ 0, 0 }, .{ 1, 1 }, .{ 2, 2 }));
    try std.testing.expectError(error.NonFinitePictureMatrix, resize(matrix, .{ std.math.nan(f64), 0 }, .{ 1, 1 }, .{ 2, 2 }));
    try std.testing.expectError(error.DegenerateResizeMatrix, resize(.{ 1e-155, 0, 0, 0, 1e-155, 0 }, .{ 0, 0 }, .{ 4294967295, 4294967295 }, .{ 1, 1 }));
}
