//! 현재 선 소유권과 변환된 끝점의 임시 표시 스냅샷입니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const host = @import("line_display_host.zig");
pub const Snapshot = struct { node: usize, paragraph: usize, anchor_node: usize, anchor_unit: usize, endpoints: @import("line_rendering_endpoints.zig").Endpoints, stroke: @import("line_stroke_values.zig").Values = .{} };
pub const GeometrySnapshot = @import("line_display_geometry_values.zig").Values;

pub fn nodes(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]u32 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    var output: std.ArrayList(u32) = .empty;
    defer output.deinit(a);
    for (session.sections[section_index].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "line")) try output.append(a, std.math.cast(u32, index) orelse return error.LimitExceeded);
    }
    return output.toOwnedSlice(a);
}

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, node: usize) !Snapshot {
    const geometry = try readGeometry(a, session, section_index, node);
    return .{ .node = geometry.node, .paragraph = geometry.paragraph, .anchor_node = geometry.anchor_node, .anchor_unit = geometry.anchor_unit, .endpoints = geometry.endpoints, .stroke = try @import("line_stroke_values.zig").read(a, &session.sections[section_index].tree, node) };
}

// Geometry alone never grants paint permission or supplies a default stroke.
pub fn readGeometry(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, node: usize) !GeometrySnapshot {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    return @import("line_display_geometry_values.zig").readWithView(a, section, &view, node);
}

test "line geometry snapshot reads all decorated lines without changing paint policy" {
    try @import("../testing/checked_allocator.zig").run(actualDecoratedLines, .{});
}

fn actualDecoratedLines(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx", a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const indices = try nodes(a, &session, 2);
    defer a.free(indices);
    try std.testing.expectEqual(@as(usize, 18), indices.len);
    var refused: usize = 0;
    for (indices) |node| {
        const geometry = try readGeometry(a, &session, 2, node);
        try std.testing.expectEqual(node, geometry.node);
        try std.testing.expect(geometry.paragraph > 0);
        const full = read(a, &session, 2, node) catch |err| {
            try std.testing.expectEqual(error.UnsupportedLineStrokeDecoration, err);
            refused += 1;
            continue;
        };
        try std.testing.expectEqualDeep(geometry.endpoints, full.endpoints);
    }
    try std.testing.expectEqual(@as(usize, 17), refused);
}
