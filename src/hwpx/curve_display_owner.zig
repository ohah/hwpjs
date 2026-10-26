//! Current grouped-curve ownership, detached from source geometry and display caches.
const std = @import("std");
const hosts = @import("drawing_display_host.zig");
const editor = @import("editor_session.zig");
pub const Owner = struct { paragraph: usize, anchor_node: usize, anchor_unit: usize };
const policy: hosts.Policy = .{ .local = "curve", .kind = null, .invalid_node = error.InvalidCurveGeometryNode, .switch_host = error.UnsupportedCurveSwitchHost, .missing_paragraph = error.MissingCurveDisplayParagraph, .unsupported_anchor = error.UnsupportedCurveAnchor };

fn groupContext(tree: *const @import("xml_part_tree.zig").Tree, node: usize) !?@import("grouped_shape_context.zig").Context {
    if (node >= tree.elements.len or !tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "curve")) return error.InvalidCurveGeometryNode;
    return @import("grouped_shape_context.zig").read(tree, node);
}
pub fn readCurrent(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraphs: []const @import("paragraph_structure_values.zig").Paragraph, first: usize, node: usize) !?Owner {
    const group = (try groupContext(tree, node)) orelse return null;
    const anchor = try hosts.sourceAnchor(tree, node, policy);
    if (anchor != group.root_anchor) return error.SourceBindingMismatch;
    const paragraph = try hosts.currentOrdinal(tree, paragraphs, first, node, policy);
    if (paragraph < first or paragraph - first >= paragraphs.len) return error.SourceBindingMismatch;
    return .{ .paragraph = paragraph, .anchor_node = anchor, .anchor_unit = try hosts.anchorUnit(a, tree, &paragraphs[paragraph - first], node, policy) };
}
pub fn encode(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, node: usize) ![]u8 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (try groupContext(&section.tree, node) == null)
        return std.json.Stringify.valueAlloc(a, .{ .sourceOnly = true, .node = node, .owner = @as(?Owner, null) }, .{});
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const owner = try readCurrent(a, &section.tree, current.paragraphs, section.first_paragraph, node);
    return std.json.Stringify.valueAlloc(a, .{ .sourceOnly = true, .node = node, .owner = owner }, .{});
}

fn allocationCase(a: std.mem.Allocator) !void {
    const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
    const bytes = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>앞😀</p:t><p:container><p:curve/></p:container></p:run></p:p></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, bytes, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const paragraphs = [_]Paragraph{.{ .template_element = 1, .source_ordinal = 1, .sites = sites }};
    try std.testing.expectEqualDeep(@as(?Owner, .{ .paragraph = 1, .anchor_node = 4, .anchor_unit = 3 }), try readCurrent(a, &tree, &paragraphs, 1, 5));
}
test "curve current owner follows only a native grouped anchor and cleans allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
test "curve current owner leaves ungrouped anchors unsupported rather than equating two null kinds" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:curve/></p:run></p:p></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(?Owner, null), try readCurrent(a, &tree, &.{}, 1, 3));
    try std.testing.expectError(error.UnsupportedCurveAnchor, hosts.sourceAnchor(&tree, 3, policy));
    try std.testing.expectError(error.InvalidCurveGeometryNode, readCurrent(a, &tree, &.{}, 1, 0));
}
