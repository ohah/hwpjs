//! Resolve language groups in the current tree and serialize one owned intent.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const faces = @import("font_faces.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, intent: @import("../model/font_face_value.zig").Value, limit: usize) ![]u8 {
    const uri = @import("document_xml.zig").head_uri;
    var container: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "fontfaces")) continue;
        const parent = element.parent orelse continue;
        if (!tree.elements[parent].is(uri, "refList") or tree.elements[parent].parent != 0) continue;
        if (container != null) return error.DuplicateFontfaces;
        container = index;
    }
    const root = container orelse return error.MissingFontfaces;
    var seen: [faces.languages.len]bool = @splat(false);
    var target: ?usize = null;
    var child = tree.elements[root].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "fontface")) continue;
        const raw = (try tree.attributeValue(a, index, "", "lang")) orelse return error.MissingFontLanguage;
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        const language = faces.languageFromSource(text) orelse return error.InvalidFontLanguage;
        if (seen[@backingInt(language)]) return error.DuplicateFontLanguage;
        seen[@backingInt(language)] = true;
        if (language == intent.language) target = index;
    }
    const name = intent.name orelse return error.InvalidFontName;
    if (target) |node| return @import("font_face_append.zig").write(a, tree, node, intent.id, name, .ttf, limit);
    return @import("font_language_append.zig").write(a, tree, root, intent.language, intent.id, name, .ttf, limit);
}
