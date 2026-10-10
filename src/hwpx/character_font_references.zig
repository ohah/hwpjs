//! Language-specific font IDs without defaults or font availability inference.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const faces = @import("font_faces.zig");
pub const Values = @import("../model/character_fonts.zig").Values;

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !?Values {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    const uri = @import("document_xml.zig").head_uri;
    if (!tree.elements[node].is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    var result: ?Values = null;
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "fontRef")) continue;
        if (result != null) return error.DuplicateCharacterFontReference;
        var values: Values = @splat(null);
        for (faces.reference_names, 0..) |name, language| {
            if (try tree.attributeValue(a, index, "", name)) |raw| {
                const value = try raw.toUtf8(a, limit);
                defer a.free(value);
                values[language] = try @import("xml_values.zig").unsigned32(value);
            }
        }
        result = values;
    }
    return result;
}

test "character font references preserve absent language zero and namespace boundaries" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:foreign'><h:charPr><x:fontRef hangul='9'/><h:fontRef hangul='&#48;' latin='7' x:hanja='8'/></h:charPr><h:charPr/><h:charPr><h:fontRef/></h:charPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            try std.testing.expectEqualDeep(@as(?Values, .{ 0, 7, null, null, null, null, null }), try read(allocator, source, 1, 64));
            try std.testing.expectEqual(@as(?Values, null), try read(allocator, source, 4, 64));
            try std.testing.expectEqualDeep(@as(?Values, @splat(null)), try read(allocator, source, 5, 64));
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
}

test "character font references reject duplicate children and malformed IDs" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, expected: anyerror }{
        .{ .body = "<h:fontRef/><h:fontRef/>", .expected = error.DuplicateCharacterFontReference },
        .{ .body = "<h:fontRef hangul='4294967296'/>", .expected = error.InvalidUnsigned32 },
        .{ .body = "<h:fontRef latin='-1'/>", .expected = error.InvalidNonNegativeInteger },
    }) |case| {
        const input = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr>{s}</h:charPr></h:head>", .{case.body});
        defer a.free(input);
        var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.expected, read(a, &tree, 1, 64));
    }
}

test "character font references resolve actual language tables without changing source" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "facename", "charshape", "parashape" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(bytes);
        var document = try @import("package.zig").inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var links = try document.inspectFontReferences(a, .{});
        defer links.deinit(a);
        var tree = try document.readHeaderTree(a, .{});
        defer tree.deinit(a);
        const source = try a.dupe(u8, tree.source);
        defer a.free(source);
        var shapes: usize = 0;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(@import("document_xml.zig").head_uri, "charPr")) continue;
            const values = (try read(a, &tree, index, 4096)) orelse return error.MissingCharacterFontReference;
            for (values, 0..) |value, language| {
                const id = value orelse return error.MissingFontLanguageReference;
                try std.testing.expect(std.mem.indexOfScalar(u32, links.faces.tables[language].ids.items, id) != null);
            }
            shapes += 1;
        }
        try std.testing.expect(shapes > 0);
        try std.testing.expectEqualStrings(source, tree.source);
    }
}
