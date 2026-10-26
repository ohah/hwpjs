//! Compose source-keyed scripts after body edits; no second mutable XML model.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const values = @import("equation_script_values.zig");
const source_writer = @import("equation_script_write.zig");
const xml_writer = @import("xml_source_writer.zig");
const uri = @import("document_xml.zig").paragraph_uri;

fn identity(tree: *const Tree, node: usize) bool {
    if (@import("run_anchor.zig").kind(tree, node) == .equation) return true;
    for ([_][]const u8{ "container", "tbl", "tr", "tc", "subList" }) |name| if (tree.elements[node].is(uri, name)) return true;
    return false;
}

pub fn write(a: std.mem.Allocator, original: *const Tree, xml: []const u8, entries: []const values.Entry, options: source_writer.Options) ![]u8 {
    if (xml.len > options.max_output_bytes or entries.len > values.max_entries) return error.LimitExceeded;
    if (entries.len == 0) return a.dupe(u8, xml);
    var current = try @import("section_tree.zig").parse(a, xml, original.section_ordinal orelse return error.InvalidPartOrdinal, original.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, original, &current, identity);
    defer mapping.deinit(a);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    var caches: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer caches.deinit(a);
    var changes: std.ArrayList(xml_writer.Change) = .empty;
    defer changes.deinit(a);
    for (entries) |entry| {
        if ((try seen.getOrPut(a, entry.equation)).found_existing) return error.DuplicateEquationScriptEdit;
        const node = mapping.get(entry.equation) orelse return error.SourceBindingMismatch;
        if (!std.mem.eql(u8, original.sourceOf(entry.equation), current.sourceOf(node))) return error.SourceBindingMismatch;
        const prepared = try source_writer.prepare(a, &current, node, entry.text, options);
        defer a.free(prepared);
        if (prepared.len == 0) continue;
        try changes.appendSlice(a, prepared);
        const paragraph = try @import("paragraph_site_owner.zig").ancestor(&current, node);
        var child = current.elements[paragraph].first_child;
        while (child) |index| {
            const element = current.elements[index];
            if (element.is(uri, "linesegarray") and !(try caches.getOrPut(a, index)).found_existing) {
                try changes.append(a, .{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = "" });
            }
            child = element.next_sibling;
        }
    }
    std.mem.sort(xml_writer.Change, changes.items, {}, struct {
        fn less(_: void, left: xml_writer.Change, right: xml_writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return xml_writer.write(a, current.source, changes.items, options.max_output_bytes);
}
