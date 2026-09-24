const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const header_resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");

pub const Kind = enum(u8) { paragraph_shape, style, character_shape };
pub const Counts = id_references.Counts;
pub const Links = [3]Counts;

/// The only mapping from PType/RunType attributes to header resource tables.
/// The caller selects hp:p/hp:run nodes and owns element-count budgets.
pub fn noteParagraph(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize, resources: *const header_resources.Report, item_index: usize, links: *Links) !void {
    _ = try id_references.note(a, &links[@intFromEnum(Kind.paragraph_shape)], try attrs.attribute(a, tag, scope, "paraPrIDRef", max_attribute_bytes), resources.table(.para_shape), item_index);
    _ = try id_references.note(a, &links[@intFromEnum(Kind.style)], try attrs.attribute(a, tag, scope, "styleIDRef", max_attribute_bytes), resources.table(.style), item_index);
}

pub fn noteRun(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize, resources: *const header_resources.Report, item_index: usize, links: *Links) !void {
    _ = try id_references.note(a, &links[@intFromEnum(Kind.character_shape)], try attrs.attribute(a, tag, scope, "charPrIDRef", max_attribute_bytes), resources.table(.char_shape), item_index);
}
