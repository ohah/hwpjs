//! Serialize a new text run in a verified runless paragraph.
//! The caller resolves the character ID; this module owns no style fallback.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn writeWithStyle(a: std.mem.Allocator, tree: *const Tree, index: usize, header: *const Tree, characters: *const @import("header_resources.zig").Table, text: []const u8, limit: usize) ![]u8 {
    const character_id = try characterId(a, tree, index, header, characters);
    return write(a, tree, index, character_id, text, limit);
}

pub fn characterId(a: std.mem.Allocator, tree: *const Tree, index: usize, header: *const Tree, characters: *const @import("header_resources.zig").Table) !u32 {
    if (index >= tree.elements.len or !tree.elements[index].is(uri, "p")) return error.InvalidElementIndex;
    const raw = (try tree.attributeValue(a, index, "", "styleIDRef")) orelse return error.MissingStyleAttribute;
    const decoded = try raw.toUtf8(a, 4096);
    defer a.free(decoded);
    const style_id = try @import("xml_values.zig").unsigned32(decoded);
    return @import("paragraph_style_character.zig").resolve(a, header, style_id, characters);
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, index: usize, character_id: u32, text: []const u8, limit: usize) ![]u8 {
    return writeRuns(a, tree, index, &.{.{ .character_id = character_id, .text = text }}, limit);
}

pub const Run = struct { character_id: u32, text: []const u8 };

pub fn writeRuns(a: std.mem.Allocator, tree: *const Tree, index: usize, runs: []const Run, limit: usize) ![]u8 {
    if (runs.len == 0) return error.InvalidTextSites;
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    const paragraph = tree.elements[index];
    if (!paragraph.is(uri, "p") or !@import("element_whitespace_gaps.zig").empty(tree, index)) return error.UnsupportedParagraphControl;
    var child = paragraph.first_child;
    while (child) |node| {
        if (!tree.elements[node].is(uri, "linesegarray")) return error.UnsupportedParagraphControl;
        child = tree.elements[node].next_sibling;
    }
    const opening = tree.source[paragraph.start_tag.start..paragraph.start_tag.end];
    var input = try @import("../xml/input.zig").Input.init(opening, .utf8, .{ .max_bytes = opening.len, .max_characters = opening.len });
    var tag = try @import("../xml/tags.zig").parse(a, &input, .{ .max_bytes = opening.len });
    defer tag.deinit(a);
    const name = tag.name.raw;
    if (!std.mem.endsWith(u8, name, "p")) return error.SourceBindingMismatch;
    const prefix = name[0 .. name.len - 1];
    var fragments: std.ArrayList(u8) = .empty;
    defer fragments.deinit(a);
    for (runs) |row| {
        const encoded = try @import("../xml/text_writer.zig").encode(a, row.text, limit -| fragments.items.len);
        defer a.free(encoded);
        const fragment = try std.fmt.allocPrint(a, "<{s}run charPrIDRef=\"{d}\"><{s}t>{s}</{s}t></{s}run>", .{ prefix, row.character_id, prefix, encoded, prefix, prefix });
        defer a.free(fragment);
        if (fragment.len > limit -| fragments.items.len) return error.LimitExceeded;
        try fragments.appendSlice(a, fragment);
    }
    const run = fragments.items;
    const source = tree.sourceOf(index);
    if (paragraph.end_tag == null) {
        const result = try std.fmt.allocPrint(a, "{s}>{s}</{s}>", .{ opening[0 .. opening.len - 2], run, name });
        errdefer a.free(result);
        if (result.len > limit) return error.LimitExceeded;
        return result;
    }
    const writer = @import("xml_source_writer.zig");
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var insertion_end = opening.len;
    child = paragraph.first_child;
    if (child) |node| if (tree.elements[node].start_tag.start == paragraph.start_tag.end) {
        insertion_end = tree.elements[node].end - paragraph.start_tag.start;
        child = tree.elements[node].next_sibling;
    };
    try changes.append(a, .{ .start = opening.len, .end = insertion_end, .text = "", .serialized_xml = run });
    while (child) |node| {
        const cache = tree.elements[node];
        try changes.append(a, .{ .start = cache.start_tag.start - paragraph.start_tag.start, .end = cache.end - paragraph.start_tag.start, .text = "", .serialized_xml = "" });
        child = cache.next_sibling;
    }
    return writer.write(a, source, changes.items, limit);
}

test "runless paragraph XML preserves source namespace and rejects existing content" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:q='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    const cases = [_][]const u8{ "<q:p styleIDRef='0'/>", "<q:p styleIDRef='0'><q:linesegarray/></q:p>" };
    for (cases) |paragraph| {
        const xml = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, paragraph });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        const output = try write(a, &tree, 1, 2, "한😀<&", 4096);
        defer a.free(output);
        try std.testing.expectEqualStrings("<q:p styleIDRef='0'><q:run charPrIDRef=\"2\"><q:t>한😀&lt;&amp;</q:t></q:run></q:p>", output);
        try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, 2, "한", 1));
        const Probe = struct {
            fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
                const bytes = try write(allocator, parsed, 1, 2, "한😀<&", 4096);
                defer allocator.free(bytes);
            }
        };
        try std.testing.checkAllAllocationFailures(a, Probe.run, .{&tree});
    }
    var tree = try @import("xml_part_tree.zig").parse(a, prefix ++ "<q:p><q:run/></q:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedParagraphControl, write(a, &tree, 1, 2, "text", 4096));
}

test "runless paragraph XML serializes actual opengov paragraph without rewriting original session" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36386761_백제학연구총서위탁판매의뢰목록.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    const tree = &session.sections[0].tree;
    var ordinal: usize = 0;
    var checked = false;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "p")) continue;
        ordinal += 1;
        if (ordinal != 28) continue;
        const serialized = try writeWithStyle(a, tree, index, &header, resources.table(.char_shape), "본문😀<&", 4096);
        defer a.free(serialized);
        try std.testing.expect(std.mem.indexOf(u8, serialized, "charPrIDRef=\"2\"") != null);
        try std.testing.expect(std.mem.indexOf(u8, serialized, "본문😀&lt;&amp;") != null);
        try std.testing.expect(std.mem.indexOf(u8, serialized, "linesegarray") == null);
        const changed = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = element.start_tag.start, .end = element.end, .text = "", .serialized_xml = serialized }}, 4_000_000);
        defer a.free(changed);
        var reparsed = try @import("xml_part_tree.zig").parse(a, changed, .section, 0, 0, .{});
        defer reparsed.deinit(a);
        checked = true;
    }
    try std.testing.expect(checked);
    const untouched = try session.save();
    defer a.free(untouched);
    try std.testing.expectEqualSlices(u8, bytes, untouched);
}

test "runless paragraph XML explicit style path rejects missing references and cleans failed allocations" {
    const a = std.testing.allocator;
    var header = try @import("header_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:styles><h:style id='7' charPrIDRef='19'/></h:styles></h:refList></h:head>", 0, .{});
    defer header.deinit(a);
    var characters: @import("header_resources.zig").Table = .{};
    defer characters.ids.deinit(a);
    try characters.ids.append(a, 19);
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
    const cases = [_]struct { paragraph: []const u8, failure: ?anyerror }{
        .{ .paragraph = "<p styleIDRef='7'/>", .failure = null },
        .{ .paragraph = "<p/>", .failure = error.MissingStyleAttribute },
        .{ .paragraph = "<p x:styleIDRef='7'/>", .failure = error.MissingStyleAttribute },
        .{ .paragraph = "<p styleIDRef='0'/>", .failure = error.MissingStyle },
    };
    for (cases) |case| {
        const xml = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, case.paragraph });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        if (case.failure) |failure| {
            try std.testing.expectError(failure, writeWithStyle(a, &tree, 1, &header, &characters, "text", 4096));
        } else {
            const output = try writeWithStyle(a, &tree, 1, &header, &characters, "text", 4096);
            defer a.free(output);
            try std.testing.expectEqualStrings("<p styleIDRef='7'><run charPrIDRef=\"19\"><t>text</t></run></p>", output);
            const Probe = struct {
                fn run(allocator: std.mem.Allocator, section: *const Tree, head: *const Tree, table: *const @import("header_resources.zig").Table) !void {
                    const result = try writeWithStyle(allocator, section, 1, head, table, "text", 4096);
                    defer allocator.free(result);
                }
            };
            try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &header, &characters });
        }
    }
}
