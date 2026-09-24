const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const values = @import("xml_values.zig");

pub fn childIs(tree: *const tree_mod.Tree, index: usize, local: []const u8) bool {
    return tree.elements[index].is(document_xml.paragraph_uri, local);
}

/// Exactly one direct child is usable. Missing and duplicate counts are kept
/// distinct instead of inventing defaults or selecting an arbitrary duplicate.
pub fn uniqueChild(tree: *const tree_mod.Tree, parent: usize, name: []const u8, missing: *usize, duplicate: *usize) ?usize {
    var found: ?usize = null;
    var cursor = tree.elements[parent].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (!childIs(tree, index, name)) continue;
        if (found != null) {
            duplicate.* += 1;
            return null;
        }
        found = index;
    }
    if (found == null) missing.* += 1;
    return found;
}

pub fn unsigned(a: std.mem.Allocator, raw: xml.attribute_value.Value, max_bytes: usize) !u32 {
    const bytes = try raw.toUtf8(a, max_bytes);
    defer a.free(bytes);
    return values.unsigned32(bytes);
}

pub fn margin(a: std.mem.Allocator, raw: xml.attribute_value.Value, max_bytes: usize) !i64 {
    const bytes = try raw.toUtf8(a, max_bytes);
    defer a.free(bytes);
    return values.signedOrUnsigned32(bytes);
}

pub fn boolean(a: std.mem.Allocator, raw: xml.attribute_value.Value, max_bytes: usize) !bool {
    const bytes = try raw.toUtf8(a, max_bytes);
    defer a.free(bytes);
    return values.boolean(bytes);
}

pub fn optionalUnsigned(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, name: []const u8, max_bytes: usize) !?u32 {
    const raw = (try tree.attributeValue(a, index, "", name)) orelse return null;
    return try unsigned(a, raw, max_bytes);
}
