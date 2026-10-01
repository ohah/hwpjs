//! Derive XML output from authoritative current text and immutable source.
//! Original decoded text is reconstructed transiently, never a mutable cache.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const writer = @import("xml_source_writer.zig");

pub fn write(a: std.mem.Allocator, tree: *const tree_module.Tree, current: *const sites_module.Sites, options: sites_module.Options, max_output_bytes: usize) ![]u8 {
    var original = try sites_module.collect(a, tree, options);
    defer original.deinit(a);
    if (original.items.len != current.items.len) return error.InvalidTextSites;
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var total: usize = 0;
    for (original.items, current.items) |before, after| {
        if (before.element_index != after.element_index or before.start != after.start or before.end != after.end or before.empty_element != after.empty_element or before.missing_text != after.missing_text) return error.InvalidTextSites;
        if (after.text.len > options.max_text_bytes -| total) return error.LimitExceeded;
        total += after.text.len;
        if (!std.mem.eql(u8, before.text, after.text)) try changes.append(a, .{ .start = before.start, .end = before.end, .text = after.text, .expand_empty_element = before.empty_element, .run_opening = if (before.missing_text) tree.elements[before.element_index].start_tag else null });
    }
    return writer.write(a, tree.source, changes.items, max_output_bytes);
}
