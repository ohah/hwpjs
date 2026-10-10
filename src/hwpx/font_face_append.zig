//! Append within one existing language group; preserve unrelated source bytes.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, id: u32, name: []const u8, kind: @import("font_face_payload.zig").Kind, limit: usize) ![]u8 {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    const uri = @import("document_xml.zig").head_uri;
    var cursor = node;
    for ([_][]const u8{ "fontface", "fontfaces", "refList", "head" }, 0..) |local, depth| {
        if (!tree.elements[cursor].is(uri, local)) return error.InvalidFontResourceElement;
        if (depth == 3) {
            if (cursor != 0) return error.InvalidFontResourceElement;
        } else cursor = tree.elements[cursor].parent orelse return error.InvalidFontResourceElement;
    }
    const lang_raw = (try tree.attributeValue(a, node, "", "lang")) orelse return error.MissingFontLanguage;
    const lang = try lang_raw.toUtf8(a, 4096);
    defer a.free(lang);
    if (@import("font_faces.zig").languageFromSource(lang) == null) return error.InvalidFontLanguage;
    var seen: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer seen.deinit(a);
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "font")) continue;
        var face = try @import("font_face_values.zig").read(a, tree, index, 4096);
        defer face.deinit(a);
        const slot = try seen.getOrPut(a, face.id);
        if (slot.found_existing) return error.DuplicateFontId;
    }
    if (seen.contains(id)) return error.DuplicateFontId;
    const payload = try @import("font_face_payload.zig").write(a, id, name, kind, 4096, limit);
    defer a.free(payload);
    return @import("xml_group_append.zig").write(a, tree, node, .font, seen.count(), payload, limit);
}

test "HWPX font append preserves sparse IDs opaque XML and allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces><h:fontface lang='HANGUL' fontCnt='1'><h:font id='7' face='Old'/><!--keep--></h:fontface><h:fontface lang='LATIN'/></h:fontfaces></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 3, 9, "New", .ttf, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces><h:fontface lang='HANGUL' fontCnt='2'><h:font id='7' face='Old'/><!--keep--><font xmlns=\"http://www.hancom.co.kr/hwpml/2011/head\" id=\"9\" face=\"New\" type=\"TTF\" isEmbedded=\"0\"/></h:fontface><h:fontface lang='LATIN'/></h:fontfaces></h:refList></h:head>", output);
            try std.testing.expect(std.mem.indexOf(u8, output, "fontCnt='2'") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "<h:font id='7' face='Old'/><!--keep-->") != null);
            const empty = try write(allocator, source, 5, 0, "Latin", .ttf, 4096);
            defer allocator.free(empty);
            var parsed = try @import("xml_part_tree.zig").parse(allocator, empty, .header, null, 0, .{});
            defer parsed.deinit(allocator);
            var face = try @import("font_face_values.zig").read(allocator, &parsed, 6, 4096);
            defer face.deinit(allocator);
            try std.testing.expectEqualStrings("Latin", face.name.?);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.DuplicateFontId, write(a, &tree, 3, 7, "New", .ttf, 4096));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 3, 9, "New", .ttf, 1));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX font append rejects contradictory counts duplicate IDs and foreign groups" {
    const a = std.testing.allocator;
    for ([_]struct { group: []const u8, content: []const u8, expected: anyerror }{
        .{ .group = "<h:fontface lang='HANGUL' fontCnt='2'>", .content = "<h:font id='7'/>", .expected = error.ResourceCountMismatch },
        .{ .group = "<h:fontface lang='HANGUL' fontCnt='bad'>", .content = "", .expected = error.InvalidNonNegativeInteger },
        .{ .group = "<h:fontface lang='HANGUL'>", .content = "<h:font id='7'/><h:font id='7'/>", .expected = error.DuplicateFontId },
        .{ .group = "<h:fontface lang='UNKNOWN'>", .content = "", .expected = error.InvalidFontLanguage },
        .{ .group = "<h:fontface>", .content = "", .expected = error.MissingFontLanguage },
    }) |case| {
        const input = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces>{s}{s}</h:fontface></h:fontfaces></h:refList></h:head>", .{ case.group, case.content });
        defer a.free(input);
        var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.expected, write(a, &tree, 3, 9, "New", .ttf, 4096));
        try std.testing.expectEqualStrings(input, tree.source);
    }
    var foreign = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><fontfaces xmlns='urn:foreign'><h:fontface lang='HANGUL'/></fontfaces></h:refList></h:head>", .header, null, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectError(error.InvalidFontResourceElement, write(a, &foreign, 3, 9, "New", .ttf, 4096));
}
