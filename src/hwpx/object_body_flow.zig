//! Source-bound direct-body axis textbox. Preview qualification is a separate cohort.
const std = @import("std");
const t = @import("../model/object_body_flow.zig");
const geometry = @import("../model/object_geometry.zig");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
/// Existing structure only. Never synthesizes margins or strips captions.
pub fn readExisting(a: std.mem.Allocator, tree: *const Tree, node: usize) !t.Flow {
    _ = try @import("object_outer_margins.zig").marginNode(a, tree, node);
    const value = try @import("picture_flow_values.zig").readRectangle(a, tree, node);
    const wrap = value.text_wrap orelse return error.MissingObjectBodyFlow;
    const side = value.text_flow orelse return error.MissingObjectBodyFlow;
    if (wrap > 3 or side > 3) return error.UnsupportedObjectBodyFlow;
    for (value.outside_margins) |margin| {
        const number = margin orelse return error.MissingObjectOuterMargins;
        if (number < 0 or number > 32767) return error.InvalidObjectOuterMargins;
    }
    if (try @import("table_caption_values.zig").readRectangle(a, tree, node) != null) return error.UnsupportedObjectBodyFlowCaption;
    const position = try @import("picture_position_values.zig").readRectangle(a, tree, node);
    if (position.flags[1] != false or position.flags[2] != true or position.relations[2] != 0) return error.UnsupportedObjectBodyFlowPosition;
    const text = (try @import("drawing_text_values.zig").read(a, tree, node)) orelse return error.MissingDrawingText;
    const list = text.list_node orelse return error.MissingDrawingText;
    // drawText.editable is text metadata, not the rectangle protection policy.
    // observe() retains object_geometry_owner editable.position and field protection.
    // A plain text subList only. Nested controls require independent layout qualification.
    // Parser elements are in source preorder (Tree.startTagIndex uses this ordering).
    // The list closing span bounds its descendants; never walk unrelated ancestors.
    const list_end = tree.elements[list].end;
    for (tree.elements[list + 1 ..], list + 1..) |element, index| {
        if (element.start_tag.start >= list_end) break;
        var allowed = false;
        inline for (.{ "p", "run", "t", "lineBreak", "tab", "linesegarray", "lineseg" }) |name| {
            if (fields.childIs(tree, index, name)) allowed = true;
        }
        if (!allowed) return error.UnsupportedObjectBodyFlowContent;
    }
    return .{ .textWrap = @fromBackingInt(@intCast(wrap)), .textFlow = @fromBackingInt(@intCast(side)) };
}
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, selector: geometry.Selector, revision: u64, binding: geometry.Binding) !t.Observation {
    if (selector.kind != .drawing) return error.UnsupportedObjectBodyFlow;
    var current = try @import("object_geometry_owner.zig").observe(a, session, selector, revision, binding);
    errdefer current.deinit(a);
    if (!current.editable.position) return error.ObjectGeometryReadOnly;
    return .{ .geometry = current, .flow = try readExisting(a, &session.sections[selector.section].tree, selector.node) };
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, request: t.Request) !void {
    try t.validateRequest(request);
    try @import("object_geometry_owner.zig").validate(a, session, request.geometry);
    var current = try observe(a, session, request.geometry.selector, request.geometry.historyRevision, request.geometry.binding);
    defer current.deinit(a);
    if (!std.meta.eql(current.flow, request.expectedFlow)) return error.StaleObjectBodyFlow;
}
