//! Rectangle text display source, bound to the current owning paragraph.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Rendering = @import("rectangle_rendering_source.zig").Rendering;
pub const Snapshot = struct {
    drawing_node: usize,
    paragraph: usize,
    anchor_unit: usize,
    geometry: @import("picture_geometry_values.zig").Values,
    position: @import("picture_position_values.zig").Values,
    flow: @import("picture_flow_values.zig").Values,
    transform_identity: ?bool,
    rendering: Rendering,
    rectangle: @import("picture_rectangle_values.zig").Values,
    rendering_corners: ?@import("picture_rendering_corners.zig").Corners,
    stroke: ?@import("line_stroke_values.zig").Values,
    stroke_error: ?[]const u8,
    paint: @import("drawing_paint_values.zig").Values,
    text: @import("drawing_text_values.zig").Values,
    caption: ?@import("table_caption_values.zig").Values,
    group_context: ?@import("grouped_shape_context.zig").Context = null,
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, node: usize) !Snapshot {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const tree = &section.tree;
    const host = try @import("rectangle_display_host.zig").read(a, session, section_index, node);
    const group = try @import("grouped_shape_context.zig").read(tree, node);
    const rendering_source = try @import("rectangle_rendering_source.zig").read(a, tree, node);
    return .{
        .drawing_node = node,
        .paragraph = host.paragraph,
        .anchor_unit = host.anchor_unit,
        .group_context = group,
        .geometry = rendering_source.geometry,
        .position = rendering_source.position,
        .flow = rendering_source.flow,
        .transform_identity = rendering_source.transform_identity,
        .rendering = rendering_source.rendering,
        .rectangle = rendering_source.rectangle,
        .rendering_corners = rendering_source.rendering_corners,
        .stroke = rendering_source.stroke,
        .stroke_error = rendering_source.stroke_error,
        .paint = rendering_source.paint,
        .text = (try @import("drawing_text_values.zig").read(a, tree, node)) orelse return error.MissingDrawingText,
        .caption = try @import("table_caption_values.zig").readRectangle(a, tree, node),
    };
}

test "HWPX drawing text snapshot grouped rectangles preserve absence and root anchor" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    for ([_]usize{ 94, 122 }) |node| {
        const value = try read(a, &session, 0, node);
        try std.testing.expectEqual(@as(usize, 1), value.paragraph);
        try std.testing.expectEqual(@as(usize, 0), value.anchor_unit);
        try std.testing.expectEqual(@as(usize, 31), value.group_context.?.root_anchor);
        try std.testing.expectEqual(@as(usize, 2), value.group_context.?.depth);
        try std.testing.expect(value.geometry.width == null and value.geometry.height == null);
    }
    _ = try session.spliceAnchored(0, 1, 0, 0, "앞😀");
    for ([_]usize{ 94, 122 }) |node| try std.testing.expectEqual(@as(usize, 3), (try read(a, &session, 0, node)).anchor_unit);
}

test "HWPX drawing text snapshot uses actual rectangle size and current anchor" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-layout.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const bindings = try @import("drawing_text_bindings.zig").read(a, &session, 0);
    defer a.free(bindings);
    const value = try read(a, &session, 0, bindings[0].owner.drawing_node);
    try std.testing.expectEqual(@as(usize, 10), value.paragraph);
    try std.testing.expectEqual(@as(usize, 0), value.anchor_unit);
    try std.testing.expectEqual(@as(?u32, 19431), value.geometry.width);
    try std.testing.expectEqual(@as(?u32, 9000), value.geometry.height);
    try std.testing.expectEqualDeep([4]?i64{ 283, 283, 283, 283 }, value.text.margins);
    try std.testing.expectError(error.UnsupportedDrawingTextAnchor, read(a, &session, 0, 0));
}

test "HWPX drawing text snapshot preserves actual separate caption with allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/textbox.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const bindings = try @import("drawing_text_bindings.zig").read(a, &session, 0);
    defer a.free(bindings);
    const node = bindings[0].owner.drawing_node;
    const value = try read(a, &session, 0, node);
    try std.testing.expectEqual(@as(?u32, 3), value.caption.?.side);
    try std.testing.expectEqualDeep([4]?u32{ 0, 0, 0, 0 }, value.position.relations);
    try std.testing.expectEqualDeep([4]?bool{ false, false, true, false }, value.position.flags);
    try std.testing.expectEqualDeep([4]?i64{ 0, 0, 0, 0 }, value.flow.outside_margins);
    try std.testing.expectEqual(@as(?i64, 9736), value.geometry.horizontal_offset);
    try std.testing.expectEqual(@as(?i64, 11163), value.geometry.vertical_offset);
    try std.testing.expectEqual(@as(?bool, true), value.transform_identity);
    try std.testing.expectEqualDeep(@as(?[6]f64, .{ 1, 0, 0, 0, 1, 0 }), value.rendering.matrix);
    try std.testing.expectEqual(@as(?[]const u8, null), value.rendering.matrix_error);
    try std.testing.expectEqualDeep([4][2]?i64{ .{ 0, 0 }, .{ 11763, 0 }, .{ 11763, 5476 }, .{ 0, 5476 } }, value.rectangle.points);
    try std.testing.expectEqualDeep(@import("line_stroke_values.zig").Values{ .color = 0, .width = 33, .style = 1 }, value.stroke.?);
    try std.testing.expectEqual(@as(?i64, 850), value.caption.?.gap);
    try std.testing.expectEqual(@as(?u32, 11763), value.caption.?.last_width);
    try std.testing.expect(value.caption.?.list_node != value.text.list_node);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, index: usize, expected: Snapshot) !void {
            try std.testing.expectEqualDeep(expected, try read(allocator, state, 0, index));
        }
    }.run, .{ &session, node, value });
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
