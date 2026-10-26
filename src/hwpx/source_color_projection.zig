//! Derived colors live in the same report arena; raw fill_report is untouched.
const std = @import("std");
const Source = @import("border_fill_source.zig").Source;
const policy = @import("source_color_profile.zig");
pub fn enrich(source: *Source, profile: policy.Profile) !void {
    if (source.semantic_face_colors != null) return error.SourceColorAlreadyProjected;
    const a = source.arena.allocator();
    var count: usize = 0;
    if (source.fill_report) |report| for (report.nodes) |node| {
        if (node.kind == .win_brush and node.get(.face_color) != null) count += 1;
    };
    const values = try a.alloc(policy.SemanticFaceColor, count);
    var i: usize = 0;
    if (source.fill_report) |report| for (report.nodes) |node| {
        if (node.kind != .win_brush) continue;
        const raw = node.get(.face_color) orelse continue;
        values[i] = .{ .node = node.element_index, .rgb = policy.decode(profile, .win_brush_face_color, raw) };
        i += 1;
    };
    source.semantic_face_colors = values;
    source.source_color_profile = profile;
}
pub fn enrichReport(report: *@import("table_border_sources.zig").Report, profile: policy.Profile) !void {
    for (report.styles) |*source| try enrich(source, profile);
}
