//! 텍스트 유무와 관계없는 사각형 자체 변환 및 꼭짓점 원값입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Rendering = struct {
    matrix: ?[6]f64,
    matrix_error: ?[]const u8,
    flip: [2]?bool,
    angle: ?u32,
    reverse: ?bool,
    center: [2]?i64,
    rotate_image: ?bool,
};
pub const Source = struct {
    stroke: ?@import("line_stroke_values.zig").Values,
    stroke_error: ?[]const u8,
    geometry: @import("picture_geometry_values.zig").Values,
    position: @import("picture_position_values.zig").Values,
    flow: @import("picture_flow_values.zig").Values,
    group_context: ?@import("grouped_shape_context.zig").Context,
    paint: @import("drawing_paint_values.zig").Values,
    rendering: Rendering,
    transform_identity: ?bool,
    rectangle: @import("picture_rectangle_values.zig").Values,
    rendering_corners: ?@import("picture_rendering_corners.zig").Corners,
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) !Source {
    var transform = try @import("picture_transform_values.zig").readRectangle(a, tree, node, 1024);
    defer transform.deinit(a);
    var matrix_error: ?[]const u8 = null;
    const matrix: ?[6]f64 = @import("picture_transform_affine.zig").renderingMatrix(&transform) catch |err| block: {
        matrix_error = @errorName(err);
        break :block null;
    };
    const rectangle = try @import("picture_rectangle_values.zig").readRectangle(a, tree, node);
    var stroke_error: ?[]const u8 = null;
    const stroke: ?@import("line_stroke_values.zig").Values = @import("line_stroke_values.zig").readRectangle(a, tree, node) catch |err| switch (err) {
        error.UnsupportedLineStrokeDecoration, error.UnsupportedLineStrokeColor, error.UnsupportedLineStrokeStyle => block: {
            stroke_error = @errorName(err);
            break :block null;
        },
        else => return err,
    };
    return .{
        .stroke = stroke,
        .stroke_error = stroke_error,
        .geometry = try @import("picture_geometry_values.zig").readRectangle(a, tree, node),
        .position = try @import("picture_position_values.zig").readRectangle(a, tree, node),
        .flow = try @import("picture_flow_values.zig").readRectangle(a, tree, node),
        .group_context = try @import("grouped_shape_context.zig").read(tree, node),
        .paint = try @import("drawing_paint_values.zig").read(a, tree, node),
        .rendering = .{ .matrix = matrix, .matrix_error = matrix_error, .flip = transform.flip, .angle = transform.angle, .reverse = transform.reverse, .center = transform.center, .rotate_image = transform.rotate_image },
        .transform_identity = @import("picture_transform_values.zig").rectangleIdentity(&transform),
        .rectangle = rectangle,
        .rendering_corners = if (matrix) |value| @import("picture_rendering_corners.zig").apply(rectangle, value) catch null else null,
    };
}

test "HWPX rectangle rendering source includes nontext group member" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "rect")) continue;
        const source = try read(a, tree, node);
        try std.testing.expect(source.rendering_corners != null);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source_tree: *const Tree, index: usize) !void {
                _ = try read(allocator, source_tree, index);
            }
        }.run, .{ tree, node });
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 3), count);
}
