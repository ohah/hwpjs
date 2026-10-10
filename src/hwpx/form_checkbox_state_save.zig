//! Compose checkbox scalars after text/layout XML with immutable owner binding.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Entry = @import("form_checkbox_state_values.zig").Entry;
fn identity(tree: *const Tree, node: usize) bool {
    if (@import("run_anchor.zig").kind(tree, node)) |kind| if (@import("run_anchor.zig").isForm(kind)) return true;
    for ([_][]const u8{ "container", "tbl", "tr", "tc", "subList" }) |name| if (tree.elements[node].is(@import("document_xml.zig").paragraph_uri, name)) return true;
    return false;
}
pub fn write(a: std.mem.Allocator, source: *const Tree, xml: []const u8, entries: []const Entry, limit: usize) ![]u8 {
    if (xml.len > limit or entries.len > 100000) return error.LimitExceeded;
    const ordinal = source.section_ordinal orelse return error.InvalidPartOrdinal;
    var current = try @import("section_tree.zig").parse(a, xml, ordinal, source.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, source, &current, identity);
    defer mapping.deinit(a);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (entries) |entry| {
        const node = mapping.get(entry.form_node) orelse return error.SourceBindingMismatch;
        const existing = try seen.getOrPut(a, entry.form_node);
        if (existing.found_existing) return error.DuplicateFormStateEdit;
        const output = try @import("form_checkbox_state_write.zig").write(a, &current, node, entry.state, limit);
        defer a.free(output);
        var next = try @import("section_tree.zig").parse(a, output, ordinal, source.item_index, .{});
        current.deinit(a);
        current = next;
        next = undefined;
    }
    return a.dupe(u8, current.source);
}
