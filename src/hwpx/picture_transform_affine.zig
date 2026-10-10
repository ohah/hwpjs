//! renderingInfo 행렬만 합성합니다. flip·회전 중심·그룹 배치는 적용하지 않습니다.
const std = @import("std");
const transforms = @import("picture_transform_values.zig");
const affine = @import("../geometry/affine_row.zig");
pub const Matrix = affine.Matrix;
const finite = affine.finite;
pub const multiply = affine.multiply;
pub const transformPoint = affine.transformPoint;

pub fn required(matrix: transforms.Matrix) !Matrix {
    var result: Matrix = undefined;
    for (matrix.values, 0..) |number, index| result[index] = number orelse return error.IncompletePictureMatrix;
    return finite(result);
}

pub fn renderingMatrix(value: *const transforms.Values) !Matrix {
    if (value.unknown_matrix_nodes != 0) return error.UnsupportedPictureMatrixSequence;
    const matrices = value.matrices;
    if (matrices.len < 3 or matrices.len % 2 != 1 or matrices[0].kind != .translation) return error.UnsupportedPictureMatrixSequence;
    var result = try required(matrices[0]);
    var index: usize = 1;
    while (index < matrices.len) : (index += 2) {
        if (matrices[index].kind != .scale or matrices[index + 1].kind != .rotation) return error.UnsupportedPictureMatrixSequence;
        result = try multiply(try multiply(result, try required(matrices[index + 1])), try required(matrices[index]));
    }
    return result;
}

test "HWPX picture affine composition distinguishes noncommuting rotation and scale" {
    var matrices = [_]transforms.Matrix{
        .{ .kind = .translation, .values = .{ 1, 0, 10, 0, 1, 20 } },
        .{ .kind = .scale, .values = .{ 2, 0, 0, 0, 3, 0 } },
        .{ .kind = .rotation, .values = .{ 0, -1, 0, 1, 0, 0 } },
        .{ .kind = .scale, .values = .{ 4, 0, 0, 0, 5, 0 } },
        .{ .kind = .rotation, .values = .{ 1, 0, 0, 0, 1, 0 } },
    };
    var value: transforms.Values = .{ .matrices = matrices[0..3] };
    // (1,2) → 배율 (2,6) → 회전 (-6,2) → 이동 (4,22).
    try std.testing.expectEqualSlices(f64, &.{ 0, -3, 10, 2, 0, 20 }, &(try renderingMatrix(&value)));
    value.matrices = &matrices;
    try std.testing.expectEqualSlices(f64, &.{ 0, -15, 10, 8, 0, 20 }, &(try renderingMatrix(&value)));
}

test "HWPX picture affine rejects missing unknown nonfinite and overflowing matrices" {
    var matrices = [_]transforms.Matrix{
        .{ .kind = .translation, .values = .{ 1, 0, 0, 0, 1, 0 } },
        .{ .kind = .scale, .values = .{ 1, 0, 0, 0, 1, 0 } },
        .{ .kind = .rotation, .values = .{ 1, 0, 0, 0, 1, 0 } },
    };
    var value: transforms.Values = .{ .matrices = &matrices };
    matrices[1].values[0] = null;
    try std.testing.expectError(error.IncompletePictureMatrix, renderingMatrix(&value));
    matrices[1].values[0] = std.math.nan(f64);
    try std.testing.expectError(error.NonFinitePictureMatrix, renderingMatrix(&value));
    matrices[1].values[0] = 1;
    value.unknown_matrix_nodes = 1;
    try std.testing.expectError(error.UnsupportedPictureMatrixSequence, renderingMatrix(&value));
    value.unknown_matrix_nodes = 0;
    value.matrices = matrices[0..2];
    try std.testing.expectError(error.UnsupportedPictureMatrixSequence, renderingMatrix(&value));
    value.matrices = &matrices;
    matrices[1].kind = .rotation;
    try std.testing.expectError(error.UnsupportedPictureMatrixSequence, renderingMatrix(&value));
    try std.testing.expectError(error.NonFinitePictureMatrix, multiply(.{ 1e308, 0, 0, 0, 1, 0 }, .{ 1e308, 0, 0, 0, 1, 0 }));
}

test "HWPX picture affine preserves fractional matrices in tracked grouped picture" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "pic")) continue;
        var value = try transforms.read(a, tree, node, 32);
        defer value.deinit(a);
        try std.testing.expectEqual(@as(usize, 5), value.matrices.len);
        try std.testing.expectEqualSlices(f64, &.{ 1.296935, 0, 0, 0, 0.584921, 312 }, &(try renderingMatrix(&value)));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
}
