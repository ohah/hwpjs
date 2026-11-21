//! Narrow observed contract: an existing four-attribute margin child on a direct-body SQUARE textbox.
const std = @import("std");
const t = @import("../model/object_outer_margins.zig");
const geometry = @import("../model/object_geometry.zig");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const xml = @import("document_xml.zig");
pub fn marginNode(a: std.mem.Allocator, tree: *const Tree, node: usize) !usize {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "rect")) return error.UnsupportedObjectOuterMargins;
    const run = tree.elements[node].parent orelse return error.UnsupportedObjectOuterMargins;
    if (!fields.childIs(tree, run, "run")) return error.UnsupportedObjectOuterMargins;
    const paragraph = tree.elements[run].parent orelse return error.UnsupportedObjectOuterMargins;
    if (!fields.childIs(tree, paragraph, "p")) return error.UnsupportedObjectOuterMargins;
    const section = tree.elements[paragraph].parent orelse return error.UnsupportedObjectOuterMargins;
    if (!tree.elements[section].is(xml.section_uri, "sec")) return error.UnsupportedObjectOuterMargins;
    const position = try @import("picture_geometry_values.zig").readRectangle(a, tree, node);
    if (position.treat_as_character != false) return error.UnsupportedObjectOuterMargins;
    var missing: usize = 0;
    var duplicate: usize = 0;
    const child = fields.uniqueChild(tree, node, "outMargin", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateObjectOuterMargins;
    return child orelse error.MissingObjectOuterMargins;
}
pub fn readExisting(a: std.mem.Allocator, tree: *const Tree, node: usize) !t.Margins {
    _ = try marginNode(a, tree, node);
    const flow = try @import("picture_flow_values.zig").readRectangle(a, tree, node);
    if (flow.text_wrap != 0) return error.UnsupportedObjectOuterMargins;
    var result: t.Margins = undefined;
    inline for (.{ "left", "right", "top", "bottom" }, 0..) |name, index| {
        const value = flow.outside_margins[index] orelse return error.MissingObjectOuterMargins;
        if (value < 0 or value > 32767) return error.InvalidObjectOuterMargins;
        @field(result, name) = @intCast(value);
    }
    return result;
}
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, selector: geometry.Selector, revision: u64, binding: geometry.Binding) !t.Observation {
    if (selector.kind != .drawing) return error.UnsupportedObjectOuterMargins;
    var current = try @import("object_geometry_owner.zig").observe(a, session, selector, revision, binding);
    errdefer current.deinit(a);
    if (!current.editable.position) return error.ObjectGeometryReadOnly;
    return .{ .geometry = current, .margins = try readExisting(a, &session.sections[selector.section].tree, selector.node) };
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, request: t.Request) !void {
    try t.validateRequest(request);
    try @import("object_geometry_owner.zig").validate(a, session, request.geometry);
    var current = try observe(a, session, request.geometry.selector, request.geometry.historyRevision, request.geometry.binding);
    defer current.deinit(a);
    if (!std.meta.eql(current.margins, request.expectedMargins)) return error.StaleObjectOuterMargins;
}
