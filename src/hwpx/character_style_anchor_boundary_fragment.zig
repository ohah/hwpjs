//! Materialize one synthetic input boundary without duplicating source objects.
const std = @import("std");
pub fn write(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, site: @import("text_sites.zig").Site, start: usize, end: usize, id: ?u32, limit: usize) ![]u8 {
    if (!site.anchor_boundary or !site.missing_text or site.element_index >= tree.elements.len) return error.UnsupportedTextSite;
    const run = tree.elements[site.element_index];
    if (!run.is(@import("document_xml.zig").paragraph_uri, "run")) return error.SourceBindingMismatch;
    const ending = run.end_tag orelse return error.SourceBindingMismatch;
    if (site.start != site.end or site.start < run.start_tag.end or site.start > ending.start) return error.SourceBindingMismatch;
    const low = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, start) orelse return error.LimitExceeded);
    const high = try @import("text_site_edit.zig").bytePosition(site.text, std.math.cast(u32, end) orelse return error.LimitExceeded);
    if (high < low) return error.InvalidTextPosition;
    if (low == high) {
        const value = id orelse return a.alloc(u8, 0);
        if (try tree.attributeValue(a, site.element_index, "", "charPrIDRef")) |attribute| {
            const decoded = try attribute.toUtf8(a, 4096);
            defer a.free(decoded);
            if (try @import("xml_values.zig").unsigned32(decoded) == value) return a.alloc(u8, 0);
        }
        const tag = try @import("character_style_tag.zig").write(a, tree, site.element_index, value, limit);
        defer a.free(tag);
        const raw = tree.source[run.start_tag.start..run.start_tag.end];
        const name_end = std.mem.indexOfAny(u8, raw, " \t\r\n>") orelse return error.SourceBindingMismatch;
        const name = raw[1..name_end];
        if (!std.mem.endsWith(u8, name, "run")) return error.SourceBindingMismatch;
        const prefix = name[0 .. name.len - 3];
        const fragment = try std.mem.concat(a, u8, &.{ tag, "<", prefix, "t/>", tree.source[ending.start..ending.end] });
        errdefer a.free(fragment);
        if (fragment.len > limit) return error.LimitExceeded;
        return fragment;
    }
    const opening = if (id) |value| try @import("character_style_tag.zig").write(a, tree, site.element_index, value, limit) else try a.dupe(u8, tree.source[run.start_tag.start..run.start_tag.end]);
    defer a.free(opening);
    const closing = tree.source[ending.start..ending.end];
    if (opening.len > limit or closing.len > limit - opening.len) return error.LimitExceeded;
    const empty = try std.mem.concat(a, u8, &.{ opening, closing });
    defer a.free(empty);
    return @import("xml_source_writer.zig").write(a, empty, &.{.{ .start = opening.len, .end = opening.len, .text = site.text[low..high], .run_opening = .{ .start = 0, .end = opening.len } }}, limit);
}
