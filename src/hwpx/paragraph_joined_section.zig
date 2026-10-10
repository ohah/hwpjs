//! One joined paragraph against immutable section source; keep inter-node gaps.
//! Other current paragraphs/formula outputs must be composed by session save.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;
const writer = @import("xml_source_writer.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return writeMode(a, tree, current, options, limit, false);
}

pub fn writeWithTabs(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    return writeMode(a, tree, current, options, limit, true);
}

fn writeMode(a: std.mem.Allocator, tree: *const Tree, current: *const Joined, options: @import("text_sites.zig").Options, limit: usize, allow_tabs: bool) ![]u8 {
    try current.validate();
    const first = current.pieces[0];
    if (first.source_ordinal == null or first.generated_id != null) return error.SourceBindingMismatch;
    // This standalone source projection cannot recompute formula results.
    if (try @import("formula_section_save.zig").hasFormula(a, tree)) return error.UnsupportedJoinedFormulaSave;
    const xml = if (allow_tabs) try @import("paragraph_joined_xml.zig").writeWithTabs(a, tree, current, options, limit) else try @import("paragraph_joined_xml.zig").write(a, tree, current, options, limit);
    defer a.free(xml);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    const root = tree.elements[first.template_element];
    try changes.append(a, .{ .start = root.start_tag.start, .end = root.end, .text = "", .serialized_xml = xml });
    var previous = first.template_element;
    var ids: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer ids.deinit(a);
    for (current.pieces[1..]) |piece| {
        if (piece.template_element == previous) {
            const id = piece.generated_id orelse return error.SourceBindingMismatch;
            if (piece.source_ordinal != null or id == 0) return error.SourceBindingMismatch;
            if ((try ids.getOrPut(a, id)).found_existing) return error.DuplicateParagraphId;
            continue;
        }
        if (piece.generated_id != null or piece.source_ordinal == null or piece.template_element <= previous) return error.SourceBindingMismatch;
        const node = tree.elements[piece.template_element];
        try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = "" });
        previous = piece.template_element;
    }
    return writer.write(a, tree.source, changes.items, limit);
}
