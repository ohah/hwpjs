//! Source-only zero-width fragments. Never assigns the selected text style.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Site = @import("character_style_retained_sites.zig").Site;
pub fn before(a: std.mem.Allocator, tree: *const Tree, run: usize, sites: []const Site, cursor: *usize, boundary: usize, output: *std.ArrayList(u8), limit: usize) !void {
    if (run >= tree.elements.len or cursor.* > sites.len) return error.SourceBindingMismatch;
    const owner = tree.elements[run];
    const ending = owner.end_tag orelse return error.SourceBindingMismatch;
    while (cursor.* < sites.len and sites[cursor.*].source_start <= boundary) {
        const site = sites[cursor.*];
        if (site.element >= tree.elements.len) return error.SourceBindingMismatch;
        try append(a, output, tree.source[owner.start_tag.start..owner.start_tag.end], limit);
        if (site.text_element) |index| {
            if (index >= tree.elements.len or tree.elements[index].parent != run) return error.SourceBindingMismatch;
            const text = tree.elements[index];
            const text_end = text.end_tag orelse return error.SourceBindingMismatch;
            try append(a, output, tree.source[text.start_tag.start..text.start_tag.end], limit);
            try append(a, output, tree.sourceOf(site.element), limit);
            try append(a, output, tree.source[text_end.start..text_end.end], limit);
        } else {
            if (tree.elements[site.element].parent != run) return error.SourceBindingMismatch;
            try append(a, output, tree.sourceOf(site.element), limit);
        }
        try append(a, output, tree.source[ending.start..ending.end], limit);
        cursor.* += 1;
    }
}
fn append(a: std.mem.Allocator, output: *std.ArrayList(u8), part: []const u8, limit: usize) !void {
    if (part.len > limit -| output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, part);
}
