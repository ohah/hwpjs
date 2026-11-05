//! Resolve language groups in the current tree and serialize one owned intent.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const faces = @import("font_faces.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, intent: @import("../model/font_face_value.zig").Value, limit: usize) ![]u8 {
    const selected = try resolve(a, tree, intent.language);
    const name = intent.name orelse return error.InvalidFontName;
    if (selected.target) |node| return @import("font_face_append.zig").write(a, tree, node, intent.id, name, .ttf, limit);
    return @import("font_language_append.zig").write(a, tree, selected.root, intent.language, intent.id, name, .ttf, limit);
}

const Resolved = struct { root: usize, target: ?usize };
fn resolve(a: std.mem.Allocator, tree: *const Tree, requested_language: faces.Language) !Resolved {
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
        if (language == requested_language) target = index;
    }
    return .{ .root = root, .target = target };
}
/// At most seven language passes, regardless of the number of created fonts.
/// Per-language ordering and first-created missing group ordering are unchanged.
pub const BatchStats = struct { parses: usize = 0, element_visits: usize = 0 };
pub fn writeBatch(a: std.mem.Allocator, tree: *const Tree, intents: []const @import("../model/font_face_value.zig").Value, limit: usize, stats: ?*BatchStats) ![]u8 {
    const Request = @import("font_face_append.zig").Request;
    var groups: [7]std.ArrayList(Request) = @splat(.empty);
    defer for (&groups) |*group| group.deinit(a);
    var order: std.ArrayList(usize) = .empty;
    defer order.deinit(a);
    for (intents) |intent| {
        const language: usize = @backingInt(intent.language);
        if (groups[language].items.len == 0) try order.append(a, language);
        try groups[language].append(a, .{ .id = intent.id, .name = intent.name orelse return error.InvalidFontName });
    }
    var current = tree.*;
    var owned: ?Tree = null;
    defer if (owned) |*value| value.deinit(a);
    for (order.items) |language| {
        if (stats) |counts| counts.element_visits += current.elements.len;
        const selected = try resolve(a, &current, @fromBackingInt(@intCast(language)));
        const next = if (selected.target) |node|
            try @import("font_face_append.zig").writeMany(a, &current, node, groups[language].items, .ttf, limit)
        else
            try @import("font_language_append.zig").writeMany(a, &current, selected.root, @fromBackingInt(@intCast(language)), groups[language].items, .ttf, limit);
        defer a.free(next);
        const parsed = try @import("header_tree.zig").parse(a, next, tree.item_index, .{ .max_xml_bytes = limit });
        if (stats) |counts| counts.parses += 1;
        if (owned) |*value| value.deinit(a);
        owned = parsed;
        current = parsed;
    }
    return a.dupe(u8, current.source);
}
