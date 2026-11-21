//! Existing outMargin start-tag edits only. Candidate adoption belongs to History V2.
const std = @import("std");
const t = @import("../model/object_outer_margins.zig");
const owners = @import("object_outer_margins.zig");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
fn equal(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: u32) !bool {
    return try @import("table_xml_fields.zig").margin(a, raw, 4096) == value;
}
fn serialize(a: std.mem.Allocator, quote: u8, value: u32) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, value, quote });
}
pub fn writeTree(a: std.mem.Allocator, tree: *const Tree, node: usize, expected: t.Margins, after: t.Margins, limit: usize) ![]u8 {
    try t.validateMargins(expected);
    try t.validateMargins(after);
    const current = try owners.readVerified(a, tree, node);
    if (!std.meta.eql(current.margins, expected)) return error.StaleObjectOuterMargins;
    try owners.validateChange(current.verticalOnly, current.margins, after);
    const child = try owners.marginNode(a, tree, node);
    const tag = try @import("xml_bound_attributes_write.zig").write(a, tree, child, &.{ "left", "right", "top", "bottom" }, u32, .{ after.left, after.right, after.top, after.bottom }, equal, serialize, limit);
    defer a.free(tag);
    const span = tree.elements[child].start_tag;
    return @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, limit);
}
pub fn prepare(a: std.mem.Allocator, before: []const u8, request: t.Request, options: editor.Options) !?editor.Session {
    try t.validateRequest(request);
    var current = try editor.open(a, before, options);
    defer current.deinit();
    const selector = try @import("object_geometry_write.zig").rebindSaved(a, &current, request.geometry);
    var observed = try owners.observe(a, &current, selector, request.geometry.historyRevision, request.geometry.binding);
    defer observed.deinit(a);
    if (!std.meta.eql(observed.margins, request.expectedMargins)) return error.StaleObjectOuterMargins;
    if (std.meta.eql(request.margins, request.expectedMargins)) return null;
    const tree = &current.sections[selector.section].tree;
    const edited = try writeTree(a, tree, selector.node, request.expectedMargins, request.margins, options.max_xml_bytes);
    defer a.free(edited);
    const cleared = try @import("page_settings_layout_cache.zig").remove(a, edited, selector.section, tree.item_index, options.max_xml_bytes);
    defer a.free(cleared);
    const package = try @import("../zip/replace_writer.zig").write(a, before, &.{.{ .entry_index = current.sections[selector.section].entry_index, .bytes = cleared }}, .{ .max_output_bytes = options.max_output_bytes });
    defer a.free(package);
    return try editor.open(a, package, options);
}
