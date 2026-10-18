//! 선 원본 끝점에 공통 renderingInfo 행렬만 적용합니다.
const std = @import("std");
const geometry = @import("line_geometry_values.zig");
const transforms = @import("picture_transform_values.zig");
const affine = @import("picture_transform_affine.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Endpoints = [2][2]f64;

pub fn apply(value: geometry.Values, matrix: affine.Matrix) !Endpoints {
    var output: Endpoints = undefined;
    const points = [_]?geometry.Point{ value.start, value.end };
    for (points, &output) |optional, *target| {
        const point = optional orelse return error.IncompleteLineEndpoints;
        const x: f64 = @floatFromInt(point.x orelse return error.IncompleteLineEndpoints);
        const y: f64 = @floatFromInt(point.y orelse return error.IncompleteLineEndpoints);
        target.* = try affine.transformPoint(matrix, .{ x, y });
    }
    return output;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, max_matrices: usize) !Endpoints {
    const value = try geometry.read(a, tree, node);
    var transform = try transforms.readLine(a, tree, node, max_matrices);
    defer transform.deinit(a);
    return apply(value, try affine.renderingMatrix(&transform));
}

test "HWPX line rendering endpoints share affine order and reject incomplete geometry" {
    const value: geometry.Values = .{ .start = .{ .x = 1, .y = 2 }, .end = .{ .x = 3, .y = 4 } };
    try std.testing.expectEqualDeep(Endpoints{ .{ 4, 22 }, .{ -2, 26 } }, try apply(value, .{ 0, -3, 10, 2, 0, 20 }));
    try std.testing.expectError(error.IncompleteLineEndpoints, apply(.{}, .{ 1, 0, 0, 0, 1, 0 }));
    try std.testing.expectError(error.IncompleteLineEndpoints, apply(.{ .start = .{ .x = 0 }, .end = .{ .x = 0, .y = 0 } }, .{ 1, 0, 0, 0, 1, 0 }));
    try std.testing.expectError(error.NonFinitePictureMatrix, apply(value, .{ 1e308, 0, 0, 0, 1, 0 }));
}

test "HWPX line rendering endpoints actual scaled line all allocation failures" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
            defer a.free(input);
            var session = try @import("editor_session.zig").open(a, input, .{});
            defer session.deinit();
            const tree = &session.sections[0].tree;
            var count: usize = 0;
            for (tree.elements, 0..) |element, node| {
                if (!element.is(@import("document_xml.zig").paragraph_uri, "line")) continue;
                const expected: Endpoints = if (count == 0) .{ .{ 0, 0 }, .{ 2100, 2050 } } else .{ .{ 0, 0 }, .{ 2400 * 6.166667, 2350 * 0.914894 } };
                try std.testing.checkAllAllocationFailures(a, struct {
                    fn run(allocator: std.mem.Allocator, source: *const Tree, index: usize, target: Endpoints) !void {
                        const actual = try read(allocator, source, index, 32);
                        for (actual, target) |point, reference| for (point, reference) |number, wanted| try std.testing.expectApproxEqAbs(wanted, number, 1e-8);
                    }
                }.run, .{ tree, node, expected });
                try std.testing.expectError(error.LimitExceeded, transforms.readLine(a, tree, node, 0));
                try std.testing.expectError(error.InvalidPictureDisplayNode, transforms.read(a, tree, node, 32));
                count += 1;
            }
            try std.testing.expectEqual(@as(usize, 2), count);
            try std.testing.expectError(error.InvalidLineGeometryNode, transforms.readLine(a, tree, tree.elements.len, 32));
            const saved = try session.save();
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, input, saved);
        }
    }.run, .{});
}
