//! Optional raw language metrics; absent XML is not a synthesized default.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Languages = [7]?i32;
pub const Values = struct {
    ratio: ?Languages = null,
    spacing: ?Languages = null,
    relativeSize: ?Languages = null,
    offset: ?Languages = null,
};
pub const Row = struct { id: u32, values: Values };

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !Values {
    if (tree.part_kind != .header) return error.InvalidPartKind;
    if (node >= tree.elements.len) return error.InvalidElementIndex;
    const uri = @import("document_xml.zig").head_uri;
    if (!tree.elements[node].is(uri, "charPr")) return error.InvalidCharacterShapeElement;
    var result: Values = .{};
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        inline for (@import("../reflection.zig").fields(Values)) |field| {
            const name = if (comptime std.mem.eql(u8, field.name, "relativeSize")) "relSz" else field.name;
            if (tree.elements[index].is(uri, name)) {
                if (@field(result, field.name) != null) return error.DuplicateCharacterFontMetrics;
                var values: Languages = @splat(null);
                for (@import("font_faces.zig").reference_names, 0..) |language, i| {
                    if (try tree.attributeValue(a, index, "", language)) |raw| {
                        const decoded = try raw.toUtf8(a, limit);
                        defer a.free(decoded);
                        values[i] = try @import("xml_values.zig").signed32(decoded);
                    }
                }
                @field(result, field.name) = values;
            }
        }
    }
    return result;
}

pub fn list(session: *const @import("editor_session.zig").Session) ![]Row {
    const a = session.allocator;
    const expected = try @import("character_style_resources.zig").ids(session);
    defer a.free(expected);
    const header = try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, session.options.max_xml_bytes);
    defer a.free(header.bytes);
    var tree = try @import("header_tree.zig").parse(a, header.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
    defer tree.deinit(a);
    const rows = try a.alloc(Row, expected.len);
    errdefer a.free(rows);
    var count: usize = 0;
    for (tree.elements, 0..) |_, node| {
        if (!@import("character_shape_owner.zig").contains(&tree, node)) continue;
        if (count == rows.len) return error.SourceBindingMismatch;
        const raw = (try tree.attributeValue(a, node, "", "id")) orelse return error.SourceBindingMismatch;
        const id_text = try raw.toUtf8(a, 4096);
        defer a.free(id_text);
        rows[count] = .{ .id = try @import("xml_values.zig").unsigned32(id_text), .values = try read(a, &tree, node, 4096) };
        count += 1;
    }
    if (count != rows.len) return error.SourceBindingMismatch;
    std.mem.sort(Row, rows, {}, struct {
        fn less(_: void, left: Row, right: Row) bool {
            return left.id < right.id;
        }
    }.less);
    for (rows, expected) |row, id| if (row.id != id) return error.SourceBindingMismatch;
    return rows;
}

test "HWPX font metrics preserve absent empty zero signed fields and namespaces on allocation failure" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:foreign'><h:charPr><x:ratio hangul='90'/><h:ratio hangul='0' latin='120' x:hanja='50'/><h:spacing hangul='-8'/><h:relSz/><h:offset hangul='-100'/></h:charPr><h:charPr/></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const values = try read(allocator, source, 1, 4096);
            try std.testing.expectEqualDeep(@as(?Languages, .{ 0, 120, null, null, null, null, null }), values.ratio);
            try std.testing.expectEqual(@as(?i32, -8), values.spacing.?[0]);
            try std.testing.expectEqualDeep(@as(?Languages, @splat(null)), values.relativeSize);
            try std.testing.expectEqual(@as(?i32, -100), values.offset.?[0]);
            try std.testing.expectEqualDeep(Values{}, try read(allocator, source, 7, 4096));
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX font metrics refuse duplicate children and numeric overflow" {
    const a = std.testing.allocator;
    for ([_]struct { body: []const u8, expected: anyerror }{
        .{ .body = "<h:ratio/><h:ratio/>", .expected = error.DuplicateCharacterFontMetrics },
        .{ .body = "<h:spacing/><h:spacing/>", .expected = error.DuplicateCharacterFontMetrics },
        .{ .body = "<h:relSz/><h:relSz/>", .expected = error.DuplicateCharacterFontMetrics },
        .{ .body = "<h:offset/><h:offset/>", .expected = error.DuplicateCharacterFontMetrics },
        .{ .body = "<h:spacing hangul='2147483648'/>", .expected = error.InvalidXmlSigned32 },
        .{ .body = "<h:offset hangul='-2147483649'/>", .expected = error.InvalidXmlSigned32 },
    }) |case| {
        const input = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr>{s}</h:charPr></h:head>", .{case.body});
        defer a.free(input);
        var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.expected, read(a, &tree, 1, 4096));
        try std.testing.expectEqualStrings(input, tree.source);
    }
}

test "HWPX font metrics current header list releases every partial allocation" {
    const a = std.testing.allocator;
    const fixture = @import("test_package_fixture.zig");
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' version='1.5' secCnt='2'><h:refList><h:charProperties itemCnt='1'><h:charPr id='9' height='1000'><h:ratio hangul='90'/><h:spacing latin='-4'/></h:charPr></h:charProperties></h:refList></h:head>";
    const bytes = try fixture.syntheticStructureZip(a, header, fixture.structure_section);
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("editor_session.zig").Session) !void {
            var view = original.*;
            view.allocator = allocator;
            const rows = try list(&view);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 1), rows.len);
            try std.testing.expectEqual(@as(u32, 9), rows[0].id);
            try std.testing.expectEqual(@as(?i32, 90), rows[0].values.ratio.?[0]);
            try std.testing.expectEqual(@as(?i32, -4), rows[0].values.spacing.?[1]);
        }
    }.run, .{&session});
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
