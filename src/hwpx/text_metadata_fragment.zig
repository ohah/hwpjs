//! 같은 run의 텍스트 사이에 검증된 닫힌 선언을 삽입합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Site = @import("text_sites.zig").Site;
pub const Local = struct { source_element: usize, unit: u32 };

pub fn writeManyFrom(a: std.mem.Allocator, tree: *const Tree, site: Site, provenance: *const Tree, boundaries: []const Local, limit: usize, comptime controlWriter: anytype) ![]u8 {
    if (site.missing_text or site.anchor_boundary) return error.UnsupportedTextSite;
    if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
    const text = tree.elements[site.element_index];
    const uri = @import("document_xml.zig").paragraph_uri;
    if (!text.is(uri, "t")) return error.SourceBindingMismatch;
    const run = text.parent orelse return error.SourceBindingMismatch;
    if (!tree.elements[run].is(uri, "run")) return error.SourceBindingMismatch;
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    if (site.empty_element) {
        if (text.end_tag != null or text.first_child != null or site.start != text.start_tag.start or site.end != text.start_tag.end or site.text.len != 0) return error.SourceBindingMismatch;
        try append(a, &out, tree.sourceOf(site.element_index), limit);
        for (boundaries) |boundary| {
            _ = try @import("text_site_edit.zig").bytePosition(site.text, boundary.unit);
            const control = try controlWriter(a, provenance, boundary.source_element, limit - out.items.len);
            defer a.free(control);
            try append(a, &out, control, limit);
        }
        return out.toOwnedSlice(a);
    }
    const ending = text.end_tag orelse return error.SourceBindingMismatch;
    if (site.start < text.start_tag.end or site.start > site.end or site.end > ending.start) return error.SourceBindingMismatch;
    var cursor: usize = 0;
    var previous: u32 = 0;
    for (boundaries) |boundary| {
        if (boundary.unit < previous) return error.InvalidTextPosition;
        const cut = try @import("text_site_edit.zig").bytePosition(site.text, boundary.unit);
        const encoded = try @import("../xml/text_writer.zig").encode(a, site.text[cursor..cut], limit - out.items.len);
        defer a.free(encoded);
        try append(a, &out, encoded, limit);
        try append(a, &out, tree.source[ending.start..ending.end], limit);
        const control = try controlWriter(a, provenance, boundary.source_element, limit - out.items.len);
        defer a.free(control);
        try append(a, &out, control, limit);
        try append(a, &out, tree.source[text.start_tag.start..text.start_tag.end], limit);
        cursor = cut;
        previous = boundary.unit;
    }
    const tail = try @import("../xml/text_writer.zig").encode(a, site.text[cursor..], limit - out.items.len);
    defer a.free(tail);
    try append(a, &out, tail, limit);
    return out.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
