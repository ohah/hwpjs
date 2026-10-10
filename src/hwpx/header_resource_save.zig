//! Compose paragraph and character intents into one package-selected header.
const std = @import("std");
const resources = @import("paragraph_resource_values.zig");
const head = @import("document_xml.zig").head_uri;

pub fn replacement(a: std.mem.Allocator, source: []const u8, values: *const resources.Values, max_bytes: usize) !@import("../zip/replace_writer.zig").Replacement {
    return replacementWithCharacters(a, source, values, null, max_bytes);
}
pub fn replacementWithCharacters(a: std.mem.Allocator, source: []const u8, values: *const resources.Values, characters: ?*const @import("character_resource_values.zig").Values, max_bytes: usize) !@import("../zip/replace_writer.zig").Replacement {
    return replacementWithFonts(a, source, values, characters, null, max_bytes);
}
pub fn replacementWithFonts(a: std.mem.Allocator, source: []const u8, values: *const resources.Values, characters: ?*const @import("character_resource_values.zig").Values, fonts: ?*const @import("../model/font_resource_values.zig").Values, max_bytes: usize) !@import("../zip/replace_writer.zig").Replacement {
    var document = try @import("package.zig").inspectDocument(a, source, .{});
    defer document.deinit(a);
    var inventory = try document.inspectHeaderResources(a, .{});
    defer inventory.deinit(a);
    const original_ids = inventory.table(.para_shape).ids.items;
    var tree = try document.readHeaderTree(a, .{ .tree = .{ .max_xml_bytes = max_bytes } });
    defer tree.deinit(a);
    const entry_index = document.manifest.items[tree.item_index].entry_index orelse return error.ExternalHeaderXml;
    for (values.entries.items) |intent| {
        try @import("paragraph_style_resources.zig").requireExisting(original_ids, intent.source_id);
        var template: ?usize = null;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(head, "paraPr")) continue;
            const parent = element.parent orelse continue;
            if (!tree.elements[parent].is(head, "paraProperties")) continue;
            const raw = (try tree.attributeValue(a, index, "", "id")) orelse return error.MissingParagraphShapeReference;
            if (try @import("table_xml_fields.zig").unsigned(a, raw, 4096) == intent.source_id) template = index;
        }
        const bytes = try @import("paragraph_resource_insert.zig").writeWithProperties(a, &tree, template orelse return error.InvalidParagraphShapeReference, intent.id, intent.alignment, intent.margins, intent.spacing, max_bytes);
        defer a.free(bytes);
        const next = try @import("header_tree.zig").parse(a, bytes, tree.item_index, .{ .max_xml_bytes = max_bytes });
        tree.deinit(a);
        tree = next;
    }
    if (characters) |list| for (list.entries.items) |intent| {
        if (std.mem.indexOfScalar(u32, inventory.table(.char_shape).ids.items, intent.source_id) == null) return error.InvalidCharacterShapeReference;
        var template: ?usize = null;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(head, "charPr")) continue;
            const parent = element.parent orelse continue;
            if (!tree.elements[parent].is(head, "charProperties")) continue;
            const raw = (try tree.attributeValue(a, index, "", "id")) orelse return error.MissingCharacterShapeReference;
            if (try @import("table_xml_fields.zig").unsigned(a, raw, 4096) == intent.source_id) template = index;
        }
        const bytes = try @import("character_resource_insert.zig").write(a, &tree, template orelse return error.InvalidCharacterShapeReference, intent.id, intent.properties, max_bytes);
        defer a.free(bytes);
        const next = try @import("header_tree.zig").parse(a, bytes, tree.item_index, .{ .max_xml_bytes = max_bytes });
        tree.deinit(a);
        tree = next;
    };
    if (fonts) |list| for (list.entries.items) |intent| {
        const bytes = try @import("font_resource_header.zig").write(a, &tree, intent, max_bytes);
        defer a.free(bytes);
        const next = try @import("header_tree.zig").parse(a, bytes, tree.item_index, .{ .max_xml_bytes = max_bytes });
        tree.deinit(a);
        tree = next;
    };
    return .{ .entry_index = entry_index, .bytes = try a.dupe(u8, tree.source) };
}
