//! Current logical host and UTF-16 anchor, separate from immutable geometry.
const std = @import("std");
const editor = @import("editor_session.zig");
const host = @import("connector_display_host.zig");
pub const Snapshot = struct { current: bool = true, node: usize, paragraph: usize, anchor_node: usize, anchor_unit: usize };
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, node: usize) !Snapshot {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const anchor = try host.sourceAnchor(&section.tree, node);
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    const paragraph = try host.currentOrdinal(&section.tree, view.paragraphs, section.first_paragraph, node);
    const index = std.math.sub(usize, paragraph, section.first_paragraph) catch return error.SourceBindingMismatch;
    if (index >= view.paragraphs.len) return error.SourceBindingMismatch;
    return .{ .node = node, .paragraph = paragraph, .anchor_node = anchor, .anchor_unit = try host.anchorUnit(a, &section.tree, &view.paragraphs[index], node) };
}

test "connector owner snapshot releases every failed allocation without changing source" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run><p:t>A</p:t><p:connectLine/></p:run></p:p>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const nodes = try @import("connector_geometry_source.zig").nodes(a, &session.sections[0].tree, 10);
    defer a.free(nodes);
    try std.testing.expectEqual(@as(usize, 1), nodes.len);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, current: *const editor.Session, node: usize) !void {
            const value = try read(allocator, current, 0, node);
            try std.testing.expectEqualDeep(Snapshot{ .node = node, .paragraph = 1, .anchor_node = node, .anchor_unit = 1 }, value);
        }
    }.run, .{ &session, nodes[0] });
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, 1, nodes[0]));
    try std.testing.expectError(error.InvalidConnectorGeometryNode, read(a, &session, 0, 0));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
