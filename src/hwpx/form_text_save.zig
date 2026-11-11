//! Compose owned form text through stable XML identity, preserving all other bytes.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const values = @import("form_text_values.zig");
fn identity(tree: *const Tree, node: usize) bool {
    if (@import("run_anchor.zig").kind(tree, node)) |kind| if (kind == .edit_box or kind == .combo_box) return true;
    for ([_][]const u8{ "container", "tbl", "tr", "tc", "subList" }) |name| if (tree.elements[node].is(@import("document_xml.zig").paragraph_uri, name)) return true;
    return false;
}
pub fn write(a: std.mem.Allocator, source: *const Tree, xml: []const u8, entries: []const values.Entry, limit: usize) ![]u8 {
    if (xml.len > limit or entries.len > values.max_entries) return error.LimitExceeded;
    var current = try @import("section_tree.zig").parse(a, xml, source.section_ordinal orelse return error.InvalidPartOrdinal, source.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, source, &current, identity);
    defer mapping.deinit(a);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer changes.deinit(a);
    for (entries) |entry| {
        if ((try seen.getOrPut(a, entry.form_node)).found_existing) return error.DuplicateFormTextEdit;
        const node = mapping.get(entry.form_node) orelse return error.SourceBindingMismatch;
        const prepared = try @import("form_text_source.zig").prepare(a, &current, node, entry.text, limit);
        defer a.free(prepared);
        try changes.appendSlice(a, prepared);
    }
    std.mem.sort(@import("xml_source_writer.zig").Change, changes.items, {}, struct {
        fn less(_: void, l: @import("xml_source_writer.zig").Change, r: @import("xml_source_writer.zig").Change) bool {
            return l.start < r.start;
        }
    }.less);
    return @import("xml_source_writer.zig").write(a, current.source, changes.items, limit);
}
