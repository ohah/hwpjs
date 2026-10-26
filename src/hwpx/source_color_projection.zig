//! One canonical owner-bound fill color array; raw report remains unchanged.
const std = @import("std");
const Source = @import("border_fill_source.zig").Source;
const fill = @import("fill_brush.zig");
const policy = @import("source_color_profile.zig");
const fields = [_]struct { raw: fill.Field, semantic: policy.Field, wire: []const u8 }{
    .{ .raw = .face_color, .semantic = .win_brush_face_color, .wire = "winBrush.faceColor" },
    .{ .raw = .hatch_color, .semantic = .win_brush_hatch_color, .wire = "winBrush.hatchColor" },
    .{ .raw = .color_value, .semantic = .gradation_color_value, .wire = "color.value" },
};
fn matches(node: fill.Node, field: fill.Field) bool {
    return switch (field) {
        .face_color, .hatch_color => node.kind == .win_brush,
        .color_value => node.kind == .color,
        else => false,
    };
}
fn validateColorParent(report: fill.Report, node: fill.Node, index: usize) !void {
    if (node.kind != .color) return;
    const parent = node.parent_node_index orelse return error.SourceBindingMismatch;
    if (parent >= index or parent >= report.nodes.len) return error.SourceBindingMismatch;
    const owner = report.nodes[parent];
    if (owner.kind != .gradation or owner.brush_index != node.brush_index) return error.SourceBindingMismatch;
}
pub fn enrich(source: *Source, profile: policy.Profile) !void {
    if (source.semantic_fill_colors != null or source.semantic_face_colors != null or source.source_color_profile != null) return error.SourceColorAlreadyProjected;
    const a = source.arena.allocator();
    var count: usize = 0;
    var face_count: usize = 0;
    if (source.fill_report) |report| for (report.nodes, 0..) |node, index| {
        try validateColorParent(report, node, index);
        for (fields) |field| {
            if (!matches(node, field.raw) or node.get(field.raw) == null) continue;
            count = std.math.add(usize, count, 1) catch return error.LimitExceeded;
            if (field.raw == .face_color) face_count = std.math.add(usize, face_count, 1) catch return error.LimitExceeded;
        }
    };
    const values = try a.alloc(policy.SemanticFillColor, count);
    errdefer a.free(values);
    const faces = try a.alloc(policy.SemanticFaceColor, face_count);
    errdefer a.free(faces);
    var i: usize = 0;
    var face_i: usize = 0;
    if (source.fill_report) |report| for (report.nodes) |node| {
        for (fields) |field| {
            if (!matches(node, field.raw)) continue;
            const raw = node.get(field.raw) orelse continue;
            const value: policy.SemanticFillColor = .{ .node = node.element_index, .field = field.wire, .rgb = policy.decode(profile, field.semantic, raw) };
            values[i] = value;
            i += 1;
            if (field.raw == .face_color) {
                faces[face_i] = value;
                face_i += 1;
            }
        }
    };
    // No public fields change until all allocations/validation have succeeded.
    source.semantic_fill_colors = values;
    source.semantic_face_colors = faces;
    source.source_color_profile = profile;
}
pub fn enrichReport(report: *@import("table_border_sources.zig").Report, profile: policy.Profile) !void {
    for (report.styles) |*source| try enrich(source, profile);
}
