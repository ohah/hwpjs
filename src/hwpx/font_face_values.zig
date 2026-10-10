//! Owned names from exact header font resources; no CSS or fallback policy.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const faces = @import("font_faces.zig");
pub const Value = @import("../model/font_face_value.zig").Value;

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !Value {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    const uri = @import("document_xml.zig").head_uri;
    var cursor = node;
    for ([_][]const u8{ "font", "fontface", "fontfaces", "refList", "head" }, 0..) |name, depth| {
        if (!tree.elements[cursor].is(uri, name)) return error.InvalidFontResourceElement;
        if (depth == 4) {
            if (cursor != 0) return error.InvalidFontResourceElement;
        } else cursor = tree.elements[cursor].parent orelse return error.InvalidFontResourceElement;
    }
    const parent = tree.elements[node].parent.?;
    const language_raw = (try tree.attributeValue(a, parent, "", "lang")) orelse return error.MissingFontLanguage;
    const language_text = try language_raw.toUtf8(a, limit);
    defer a.free(language_text);
    const language = faces.languageFromSource(language_text) orelse return error.InvalidFontLanguage;
    const id_raw = (try tree.attributeValue(a, node, "", "id")) orelse return error.MissingFontId;
    const id_text = try id_raw.toUtf8(a, limit);
    defer a.free(id_text);
    const id = try @import("xml_values.zig").unsigned32(id_text);
    const name = if (try tree.attributeValue(a, node, "", "face")) |raw| try raw.toUtf8(a, limit) else null;
    return .{ .language = language, .id = id, .name = name };
}

test "font face values preserve decoded names absent empty and language identity" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces><h:fontface lang='HANGUL'><h:font id='7' face='한글 &amp; 글꼴'/><h:font id='8'/></h:fontface><h:fontface lang='LATIN'><h:font id='7' face=''/></h:fontface></h:fontfaces></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            var hangul = try read(allocator, source, 4, 64);
            defer hangul.deinit(allocator);
            try std.testing.expectEqual(faces.Language.hangul, hangul.language);
            try std.testing.expectEqual(@as(u32, 7), hangul.id);
            try std.testing.expectEqualStrings("한글 & 글꼴", hangul.name.?);
            var absent = try read(allocator, source, 5, 64);
            defer absent.deinit(allocator);
            try std.testing.expect(absent.name == null);
            var latin = try read(allocator, source, 7, 64);
            defer latin.deinit(allocator);
            try std.testing.expectEqual(faces.Language.latin, latin.language);
            try std.testing.expectEqualStrings("", latin.name.?);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.InvalidFontResourceElement, read(a, &tree, 0, 64));
    try std.testing.expectError(error.InvalidElementIndex, read(a, &tree, tree.elements.len, 64));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "font face values reject malformed metadata and foreign ancestry" {
    const a = std.testing.allocator;
    for ([_]struct { language: []const u8, font: []const u8, expected: anyerror }{
        .{ .language = "", .font = "id='0'", .expected = error.MissingFontLanguage },
        .{ .language = "lang='UNKNOWN'", .font = "id='0'", .expected = error.InvalidFontLanguage },
        .{ .language = "lang='HANGUL'", .font = "", .expected = error.MissingFontId },
        .{ .language = "lang='HANGUL'", .font = "id='4294967296'", .expected = error.InvalidUnsigned32 },
    }) |case| {
        const input = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces><h:fontface {s}><h:font {s}/></h:fontface></h:fontfaces></h:refList></h:head>", .{ case.language, case.font });
        defer a.free(input);
        var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.expected, read(a, &tree, 4, 64));
    }
    var foreign = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:foreign'><h:refList><x:fontfaces><h:fontface lang='HANGUL'><h:font id='0' face='fake'/></h:fontface></x:fontfaces></h:refList></h:head>", .header, null, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectError(error.InvalidFontResourceElement, read(a, &foreign, 4, 64));
}
