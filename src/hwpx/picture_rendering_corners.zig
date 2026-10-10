//! 원본 꼭짓점에 renderingInfo만 적용합니다. 최종 페이지 배치가 아닙니다.
const std = @import("std");
const rectangles = @import("picture_rectangle_values.zig");
const affine = @import("picture_transform_affine.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Corners = [4][2]f64;

pub fn apply(rectangle: rectangles.Values, matrix: affine.Matrix) !Corners {
    if (!rectangle.present) return error.MissingPictureRectangle;
    if (rectangle.unknown_children != 0) return error.UnsupportedPictureRectangle;
    var result: Corners = undefined;
    for (rectangle.points, rectangle.point_present, 0..) |point, present, index| {
        if (!present) return error.IncompletePictureRectangle;
        const x: f64 = @floatFromInt(point[0] orelse return error.IncompletePictureRectangle);
        const y: f64 = @floatFromInt(point[1] orelse return error.IncompletePictureRectangle);
        result[index] = try affine.transformPoint(matrix, .{ x, y });
    }
    return result;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, picture: usize, max_matrices: usize) !Corners {
    const empty: @import("picture_matrix_edit_values.zig").Values = .empty;
    return readCurrent(a, tree, picture, &empty, max_matrices);
}

pub fn readCurrent(a: std.mem.Allocator, tree: *const Tree, picture: usize, edits: *const @import("picture_matrix_edit_values.zig").Values, max_matrices: usize) !Corners {
    const rectangle = try rectangles.read(a, tree, picture);
    // HWPX source pairs already describe the group-anchor coordinate frame.
    const transform = try @import("grouped_picture_affine.zig").read(a, tree, picture, edits, .source_accumulated, tree.elements.len, max_matrices);
    return apply(rectangle, transform.matrix);
}

test "HWPX picture rendering corners retain point order and reject partial and overflowing inputs" {
    var rectangle: rectangles.Values = .{ .present = true, .point_present = @splat(true), .points = .{ .{ 0, 0 }, .{ 2, 0 }, .{ 2, 3 }, .{ 0, 3 } } };
    try std.testing.expectEqualDeep(Corners{ .{ 10, 20 }, .{ 10, 24 }, .{ 1, 24 }, .{ 1, 20 } }, try apply(rectangle, .{ 0, -3, 10, 2, 0, 20 }));
    rectangle.point_present[2] = false;
    try std.testing.expectError(error.IncompletePictureRectangle, apply(rectangle, .{ 1, 0, 0, 0, 1, 0 }));
    rectangle.point_present[2] = true;
    rectangle.points[2][0] = null;
    try std.testing.expectError(error.IncompletePictureRectangle, apply(rectangle, .{ 1, 0, 0, 0, 1, 0 }));
    rectangle.points[2][0] = 2;
    try std.testing.expectError(error.NonFinitePictureMatrix, apply(rectangle, .{ 1e308, 0, 0, 0, 1, 0 }));
    rectangle.unknown_children = 1;
    try std.testing.expectError(error.UnsupportedPictureRectangle, apply(rectangle, .{ 1, 0, 0, 0, 1, 0 }));
    rectangle.present = false;
    try std.testing.expectError(error.MissingPictureRectangle, apply(rectangle, .{ 1, 0, 0, 0, 1, 0 }));
}

test "HWPX picture rendering corners read actual grouped picture without mutating source" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "pic")) continue;
        const points = try read(a, tree, node, 32);
        try std.testing.expectApproxEqAbs(@as(f64, 45899 * 1.296935), points[1][0], 1e-8);
        try std.testing.expectApproxEqAbs(@as(f64, 312), points[0][1], 1e-8);
        try std.testing.expectApproxEqAbs(@as(f64, 6300 * 0.584921 + 312), points[2][1], 1e-8);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, parsed: *const Tree, picture: usize, expected: Corners) !void {
                const actual = try read(allocator, parsed, picture, 32);
                for (actual, expected) |point, reference| {
                    for (point, reference) |number, target| try std.testing.expectApproxEqAbs(target, number, 1e-8);
                }
            }
        }.run, .{ tree, node, points });
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
