//! Existing textbox flow start-tag values only. Candidate adoption belongs to History V2.
const std = @import("std");
const t = @import("../model/object_body_flow.zig");
const owners = @import("object_body_flow.zig");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
fn equal(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: []const u8) !bool {
    const decoded = try raw.toUtf8(a, 64);
    defer a.free(decoded);
    return std.mem.eql(u8, decoded, value);
}
fn serialize(a: std.mem.Allocator, quote: u8, value: []const u8) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{s}{c}", .{ quote, value, quote });
}
pub fn writeTree(a: std.mem.Allocator, tree: *const Tree, node: usize, expected: t.Flow, after: t.Flow, limit: usize) ![]u8 {
    if (after.textWrap != .SQUARE and after.textFlow != expected.textFlow) return error.UnsupportedObjectBodyFlowSide;
    if (!std.meta.eql(try owners.readExisting(a, tree, node), expected)) return error.StaleObjectBodyFlow;
    const tag = try @import("xml_bound_attributes_write.zig").write(a, tree, node, &.{ "textWrap", "textFlow" }, []const u8, .{ @tagName(after.textWrap), @tagName(after.textFlow) }, equal, serialize, limit);
    defer a.free(tag);
    const span = tree.elements[node].start_tag;
    return @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, limit);
}
pub fn prepare(a: std.mem.Allocator, before: []const u8, request: t.Request, options: editor.Options) !?editor.Session {
    try t.validateRequest(request);
    var current = try editor.open(a, before, options);
    defer current.deinit();
    const selector = try @import("object_geometry_write.zig").rebindSaved(a, &current, request.geometry);
    var observed = try owners.observe(a, &current, selector, request.geometry.historyRevision, request.geometry.binding);
    defer observed.deinit(a);
    if (!std.meta.eql(observed.flow, request.expectedFlow)) return error.StaleObjectBodyFlow;
    if (std.meta.eql(request.flow, request.expectedFlow)) return null;
    const tree = &current.sections[selector.section].tree;
    const edited = try writeTree(a, tree, selector.node, request.expectedFlow, request.flow, options.max_xml_bytes);
    defer a.free(edited);
    const cleared = try @import("page_settings_layout_cache.zig").remove(a, edited, selector.section, tree.item_index, options.max_xml_bytes);
    defer a.free(cleared);
    const package = try @import("../zip/replace_writer.zig").write(a, before, &.{.{ .entry_index = current.sections[selector.section].entry_index, .bytes = cleared }}, .{ .max_output_bytes = options.max_output_bytes });
    defer a.free(package);
    return try editor.open(a, package, options);
}
