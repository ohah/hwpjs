//! Shared placement, transforms and paint for source-only curved shapes.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Kind = enum { ellipse, curve };
pub const Source = struct {
    component_sizes: @import("shape_component_sizes.zig").Values,
    group_context: ?@import("grouped_shape_context.zig").Context,
    geometry: @import("picture_geometry_values.zig").Values,
    position: @import("picture_position_values.zig").Values,
    flow: @import("picture_flow_values.zig").Values,
    rendering: @import("rectangle_rendering_source.zig").Rendering,
    stroke: ?@import("line_stroke_values.zig").Values,
    stroke_error: ?[]const u8,
    stroke_style: ?u32,
    paint: @import("drawing_paint_values.zig").Values,
};
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, comptime kind: Kind) !Source {
    const method = if (kind == .ellipse) "readEllipse" else "readCurve";
    var transform = try @field(@import("picture_transform_values.zig"), method)(a, tree, node, 1024);
    defer transform.deinit(a);
    var matrix_error: ?[]const u8 = null;
    const matrix: ?[6]f64 = @import("picture_transform_affine.zig").renderingMatrix(&transform) catch |err| block: {
        matrix_error = @errorName(err);
        break :block null;
    };
    var stroke_error: ?[]const u8 = null;
    const stroke: ?@import("line_stroke_values.zig").Values = @field(@import("line_stroke_values.zig"), method)(a, tree, node) catch |err| switch (err) {
        error.UnsupportedLineStrokeDecoration, error.UnsupportedLineStrokeColor, error.UnsupportedLineStrokeStyle => block: {
            stroke_error = @errorName(err);
            break :block null;
        },
        else => return err,
    };
    var line = try @import("line_shape_values.zig").collect(a, tree, node, 4096);
    defer line.deinit();
    return .{
        .component_sizes = try @import("shape_component_sizes.zig").read(a, tree, node),
        .group_context = try @import("grouped_shape_context.zig").read(tree, node),
        .geometry = try @field(@import("picture_geometry_values.zig"), method)(a, tree, node),
        .position = try @field(@import("picture_position_values.zig"), method)(a, tree, node),
        .flow = try @field(@import("picture_flow_values.zig"), method)(a, tree, node),
        .stroke = stroke,
        .stroke_error = stroke_error,
        .stroke_style = if (line.attributes.style) |style| @import("line_style_values.zig").typeIndex(style) else null,
        .paint = try @field(@import("drawing_paint_values.zig"), method)(a, tree, node),
        .rendering = .{ .matrix = matrix, .matrix_error = matrix_error, .flip = transform.flip, .angle = transform.angle, .reverse = transform.reverse, .center = transform.center, .rotate_image = transform.rotate_image },
    };
}
