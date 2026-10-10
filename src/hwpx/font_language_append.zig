//! Add an absent language group without padding or changing other languages.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const faces = @import("font_faces.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, language: faces.Language, id: u32, name: []const u8, kind: @import("font_face_payload.zig").Kind, limit: usize) ![]u8 {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    const uri = @import("document_xml.zig").head_uri;
    var cursor = node;
    for ([_][]const u8{ "fontfaces", "refList", "head" }, 0..) |local, depth| {
        if (!tree.elements[cursor].is(uri, local)) return error.InvalidFontResourceElement;
        if (depth == 2) {
            if (cursor != 0) return error.InvalidFontResourceElement;
        } else cursor = tree.elements[cursor].parent orelse return error.InvalidFontResourceElement;
    }
    var seen: [faces.languages.len]bool = @splat(false);
    var count: u32 = 0;
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "fontface")) continue;
        const raw = (try tree.attributeValue(a, index, "", "lang")) orelse return error.MissingFontLanguage;
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        const existing = faces.languageFromSource(text) orelse return error.InvalidFontLanguage;
        const ordinal = @intFromEnum(existing);
        if (seen[ordinal]) return error.DuplicateFontLanguage;
        seen[ordinal] = true;
        count += 1;
    }
    if (seen[@intFromEnum(language)]) return error.DuplicateFontLanguage;
    const font = try @import("font_face_payload.zig").write(a, id, name, kind, 4096, limit);
    defer a.free(font);
    const group = try std.fmt.allocPrint(a, "<fontface xmlns=\"{s}\" lang=\"{s}\" fontCnt=\"1\">{s}</fontface>", .{ uri, faces.source_names[@intFromEnum(language)], font });
    defer a.free(group);
    return @import("xml_group_append.zig").write(a, tree, node, .item, count, group, limit);
}

test "HWPX missing font language creates independent group under allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces itemCnt='1'><h:fontface lang='HANGUL' fontCnt='1'><h:font id='7' face='Old'/></h:fontface><!--keep--></h:fontfaces></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 2, .latin, 0, "New", .ttf, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces itemCnt='2'><h:fontface lang='HANGUL' fontCnt='1'><h:font id='7' face='Old'/></h:fontface><!--keep--><fontface xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" lang=\"LATIN\" fontCnt=\"1\"><font xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" id=\"0\" face=\"New\" type=\"TTF\" isEmbedded=\"0\"/></fontface></h:fontfaces></h:refList></h:head>", output);
            var parsed = try @import("xml_part_tree.zig").parse(allocator, output, .header, null, 0, .{});
            defer parsed.deinit(allocator);
            var face = try @import("font_face_values.zig").read(allocator, &parsed, 6, 4096);
            defer face.deinit(allocator);
            try std.testing.expectEqual(faces.Language.latin, face.language);
            try std.testing.expectEqual(@as(u32, 0), face.id);
            try std.testing.expectEqualStrings("New", face.name.?);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.DuplicateFontLanguage, write(a, &tree, 2, .hangul, 0, "New", .ttf, 4096));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX missing font language expands empty groups for every language" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces/></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    for (faces.languages) |language| {
        const output = try write(a, &tree, 2, language, 0, "New", .ttf, 4096);
        defer a.free(output);
        try std.testing.expect(std.mem.indexOf(u8, output, "<h:fontfaces itemCnt=\"1\">") != null);
        var parsed = try @import("xml_part_tree.zig").parse(a, output, .header, null, 0, .{});
        defer parsed.deinit(a);
        var face = try @import("font_face_values.zig").read(a, &parsed, 4, 4096);
        defer face.deinit(a);
        try std.testing.expectEqual(language, face.language);
        try std.testing.expectEqual(@as(u32, 0), face.id);
    }
    try std.testing.expectEqualStrings(input, tree.source);
}
