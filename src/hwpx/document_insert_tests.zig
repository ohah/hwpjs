const std = @import("std");
const insertion = @import("document_insert.zig");
const constructor = @import("../new_document/hwpx.zig");
const editor = @import("editor_session.zig");
const archive = @import("../zip/archive.zig");
const zip = @import("../zip/replace_writer.zig");
const xml_names = @import("document_xml.zig");
const Tree = @import("xml_part_tree.zig").Tree;

const a = std.testing.allocator;
const section_path = "Contents/section0.xml";
const header_path = "Contents/header.xml";
const body_tail = "</hp:p></hs:sec>";
const extra_paragraph = "<hp:p id=\"0\" paraPrIDRef=\"0\" styleIDRef=\"1\"><hp:run charPrIDRef=\"0\"><hp:t><![CDATA[둘 < x]]></hp:t></hp:run></hp:p>";

fn replace(input: []const u8, path: []const u8, old: []const u8, new: []const u8) ![]u8 {
    var indexed = try archive.open(a, input, .{});
    defer indexed.deinit();
    for (indexed.entries, 0..) |entry, index| {
        if (!std.mem.eql(u8, entry.name, path)) continue;
        const raw = try indexed.decode(entry, 64 * 1024);
        defer a.free(raw);
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, raw, old));
        const edited = try std.mem.replaceOwned(u8, a, raw, old, new);
        defer a.free(edited);
        return zip.write(a, input, &.{.{ .entry_index = index, .bytes = edited }}, .{});
    }
    return error.MissingTestPart;
}

fn textDocument(input: []const u8, text_xml: []const u8) ![]u8 {
    return replace(input, section_path, "<hp:t/>", text_xml);
}

fn expectTexts(input: []const u8, expected: []const []const u8) !void {
    var opened = try editor.open(a, input, .{});
    defer opened.deinit();
    try std.testing.expectEqual(expected.len, opened.sections[0].last_paragraph);
    for (expected, 1..) |text, paragraph| {
        const actual = try opened.anchorText(0, paragraph);
        defer a.free(actual);
        try std.testing.expectEqualStrings(text, actual);
    }
    const saved = try opened.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

fn rawAttribute(tree: *const Tree, node: usize, name: []const u8) ![]const u8 {
    const attr = (try tree.attributeValue(a, node, "", name)) orelse return error.MissingTestAttribute;
    return attr.borrowedNormalizedUtf8() orelse error.UnsupportedTestAttribute;
}

fn expectZipUntouched(before: []const u8, after: []const u8, allowed: []const []const u8) !void {
    var original = try archive.open(a, before, .{});
    defer original.deinit();
    var edited = try archive.open(a, after, .{});
    defer edited.deinit();
    try std.testing.expectEqual(original.entries.len, edited.entries.len);
    for (original.entries, edited.entries) |left, right| {
        try std.testing.expectEqualStrings(left.name, right.name);
        for (allowed) |part| {
            if (std.mem.eql(u8, left.name, part)) break;
        } else {
            try std.testing.expectEqual(left.crc32, right.crc32);
            try std.testing.expectEqualSlices(u8, left.compressed, right.compressed);
        }
    }
}

test "HWPX native document insertion authored blank body" {
    const original = try constructor.create(a);
    defer a.free(original);
    var output = try insertion.prepare(a, original, original, .{ .paragraph = 1, .unit = 0 }, .{});
    defer output.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), output.first_inserted_paragraph);
    try std.testing.expectEqual(@as(usize, 1), output.inserted_paragraphs);
    try expectTexts(output.bytes, &.{ "", "" });
    try expectZipUntouched(original, output.bytes, &.{section_path});
}

test "HWPX native document insertion interior preserves runs and remaps three colliding resource tables" {
    const empty = try constructor.create(a);
    defer a.free(empty);
    const target = try textDocument(empty, "<hp:t>앞😀</hp:t></hp:run><hp:run charPrIDRef=\"0\"><hp:t>뒤</hp:t>");
    defer a.free(target);
    const first = try textDocument(empty, "<hp:t>한&amp;글</hp:t>");
    defer a.free(first);
    const both = try replace(first, section_path, body_tail, "</hp:p>" ++ extra_paragraph ++ "</hs:sec>");
    defer a.free(both);
    const chars = try replace(both, header_path, "height=\"1100\" textColor=\"#000000\"", "height=\"1700\" textColor=\"#112233\"");
    defer a.free(chars);
    const paras = try replace(chars, header_path, "horizontal=\"LEFT\"", "horizontal=\"RIGHT\"");
    defer a.free(paras);
    const renamed = try replace(paras, header_path, "engName=\"Normal\"", "engName=\"Donor\"");
    defer a.free(renamed);
    const count = try replace(renamed, header_path, "<hh:styles itemCnt=\"1\">", "<hh:styles itemCnt=\"2\">");
    defer a.free(count);
    const next = try replace(count, header_path, "nextStyleIDRef=\"0\"", "nextStyleIDRef=\"1\"");
    defer a.free(next);
    const donor = try replace(next, header_path, "</hh:styles>", "<hh:style id=\"1\" type=\"PARA\" name=\"Donor2\" engName=\"Donor2\" paraPrIDRef=\"0\" charPrIDRef=\"0\" nextStyleIDRef=\"0\" langID=\"1042\"/></hh:styles>");
    defer a.free(donor);
    const before = try a.dupe(u8, target);
    defer a.free(before);
    const before_donor = try a.dupe(u8, donor);
    defer a.free(before_donor);

    var output = try insertion.prepare(a, target, donor, .{ .paragraph = 1, .unit = 3 }, .{});
    defer output.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), output.first_inserted_paragraph);
    try std.testing.expectEqual(@as(usize, 2), output.inserted_paragraphs);
    try expectTexts(output.bytes, &.{ "앞😀", "한&글", "둘 < x", "뒤" });
    try expectZipUntouched(target, output.bytes, &.{ header_path, section_path });
    try std.testing.expectEqualSlices(u8, before, target);
    try std.testing.expectEqualSlices(u8, before_donor, donor);

    var opened = try editor.open(a, output.bytes, .{});
    defer opened.deinit();
    const tree = &opened.sections[0].tree;
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, tree.source, "<hp:secPr "));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, tree.source, "<hp:colPr "));
    try std.testing.expect(std.mem.indexOf(u8, tree.source, "<hp:t>한&amp;글</hp:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, tree.source, "<![CDATA[둘 < x]]>") != null);
    var used: std.StringHashMapUnmanaged(void) = .empty;
    defer used.deinit(a);
    var ordinal: usize = 0;
    var paragraph = tree.elements[0].first_child;
    while (paragraph) |p| : (paragraph = tree.elements[p].next_sibling) {
        const id = try rawAttribute(tree, p, "id");
        try std.testing.expect(!(try used.getOrPut(a, id)).found_existing);
        try std.testing.expectEqualStrings(([_][]const u8{ "0", "1", "2", "0" })[ordinal], try rawAttribute(tree, p, "styleIDRef"));
        const expected = ([_][]const u8{ "0", "1", "1", "0" })[ordinal];
        try std.testing.expectEqualStrings(expected, try rawAttribute(tree, p, "paraPrIDRef"));
        var run = tree.elements[p].first_child;
        while (run) |r| : (run = tree.elements[r].next_sibling) {
            try std.testing.expectEqualStrings(expected, try rawAttribute(tree, r, "charPrIDRef"));
        }
        ordinal += 1;
    }
    const header = &opened.original_header.?;
    var styles: usize = 0;
    var characters: usize = 0;
    var alignments: usize = 0;
    for (header.elements, 0..) |element, i| {
        if (element.is(xml_names.head_uri, "style")) {
            try std.testing.expectEqualStrings(([_][]const u8{ "0", "2", "1" })[styles], try rawAttribute(header, i, "nextStyleIDRef"));
            const expected = if (styles == 0) "0" else "1";
            try std.testing.expectEqualStrings(expected, try rawAttribute(header, i, "paraPrIDRef"));
            try std.testing.expectEqualStrings(expected, try rawAttribute(header, i, "charPrIDRef"));
            styles += 1;
        } else if (element.is(xml_names.head_uri, "charPr")) {
            try std.testing.expectEqualStrings(([_][]const u8{ "1100", "1700" })[characters], try rawAttribute(header, i, "height"));
            try std.testing.expectEqualStrings(([_][]const u8{ "#000000", "#112233" })[characters], try rawAttribute(header, i, "textColor"));
            characters += 1;
        } else if (element.is(xml_names.head_uri, "align")) {
            try std.testing.expectEqualStrings(([_][]const u8{ "LEFT", "RIGHT" })[alignments], try rawAttribute(header, i, "horizontal"));
            alignments += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 3), styles);
    try std.testing.expectEqual(@as(usize, 2), characters);
    try std.testing.expectEqual(@as(usize, 2), alignments);
}

test "HWPX native document insertion start and end respect the original section prologue" {
    const empty = try constructor.create(a);
    defer a.free(empty);
    const destination = try textDocument(empty, "<hp:t>😀Z</hp:t>");
    defer a.free(destination);
    const donor = try textDocument(empty, "<hp:t>X</hp:t>");
    defer a.free(donor);
    var start = try insertion.prepare(a, destination, donor, .{ .paragraph = 1, .unit = 0 }, .{});
    defer start.deinit(a);
    try expectTexts(start.bytes, &.{ "", "X", "😀Z" });
    var end = try insertion.prepare(a, destination, donor, .{ .paragraph = 1, .unit = 3 }, .{});
    defer end.deinit(a);
    try expectTexts(end.bytes, &.{ "😀Z", "X" });
    var before = try insertion.prepare(a, end.bytes, donor, .{ .paragraph = 2, .unit = 0 }, .{});
    defer before.deinit(a);
    try expectTexts(before.bytes, &.{ "😀Z", "X", "X" });
    try std.testing.expectError(error.SplitSurrogatePair, insertion.prepare(a, destination, donor, .{ .paragraph = 1, .unit = 1 }, .{}));
    try std.testing.expectError(error.InvalidTextPosition, insertion.prepare(a, destination, donor, .{ .paragraph = 1, .unit = 4 }, .{}));
    try std.testing.expectError(error.InvalidParagraphIndex, insertion.prepare(a, destination, donor, .{ .paragraph = 2, .unit = 0 }, .{}));
}

test "HWPX native document insertion refuses incompatible and unsupported packages before publication" {
    const original = try constructor.create(a);
    defer a.free(original);
    const before = try a.dupe(u8, original);
    defer a.free(before);
    const cases = .{
        .{ section_path, "<hp:t/>", "<hp:t><hp:tab/></hp:t>", error.UnsupportedInsertBody },
        .{ section_path, "<hp:t/>", "<hp:ctrl><hp:fieldBegin/></hp:ctrl><hp:t/>", error.UnsupportedInsertBody },
        .{ section_path, "charPrIDRef=\"0\"", "charPrIDRef=\"999\"", error.UnresolvedInsertReference },
        .{ section_path, "sameGap=\"0\"", "sameGap=\"1\"", error.IncompatibleInsertSectionProperties },
        .{ header_path, "autoTabRight=\"0\"", "autoTabRight=\"1\"", error.IncompatibleInsertHeader },
        .{ header_path, "<hh:styles itemCnt=\"1\">", "<hh:styles itemCnt=\"2\">", error.InvalidInsertResourceCount },
        .{ header_path, "nextStyleIDRef=\"0\"", "nextStyleIDRef=\"999\"", error.UnresolvedInsertReference },
        .{ header_path, "</hh:charPr>", "<hh:extension hiddenRef=\"0\"/></hh:charPr>", error.UnsupportedInsertResource },
    };
    inline for (cases) |case| {
        const donor = try replace(original, case[0], case[1], case[2]);
        defer a.free(donor);
        try std.testing.expectError(case[3], insertion.prepare(a, original, donor, .{ .paragraph = 1, .unit = 0 }, .{}));
        try std.testing.expectEqualSlices(u8, before, original);
    }
    try std.testing.expectError(error.LimitExceeded, insertion.prepare(a, original, original, .{ .paragraph = 1, .unit = 0 }, .{ .max_paragraphs = 1 }));
}

test "HWPX native document insertion allocation failures keep both packages immutable" {
    const original = try constructor.create(a);
    defer a.free(original);
    const destination = try textDocument(original, "<hp:t>AB</hp:t>");
    defer a.free(destination);
    const saved = try a.dupe(u8, destination);
    defer a.free(saved);
    const donor = try replace(original, header_path, "height=\"1100\"", "height=\"1700\"");
    defer a.free(donor);
    const saved_donor = try a.dupe(u8, donor);
    defer a.free(saved_donor);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, target: []const u8, source: []const u8, target_copy: []const u8, source_copy: []const u8) !void {
            defer std.testing.expectEqualSlices(u8, target_copy, target) catch unreachable;
            defer std.testing.expectEqualSlices(u8, source_copy, source) catch unreachable;
            var result = try insertion.prepare(allocator, target, source, .{ .paragraph = 1, .unit = 1 }, .{});
            defer result.deinit(allocator);
            try expectTexts(result.bytes, &.{ "A", "", "B" });
        }
    }.run, .{ destination, donor, saved, saved_donor });
}

fn appendPart(input: []const u8, name: []const u8, data: []const u8) ![]u8 {
    const store = @import("../zip/store_writer.zig");
    var indexed = try archive.open(a, input, .{});
    defer indexed.deinit();
    var sources: std.ArrayList(store.Source) = .empty;
    defer {
        for (sources.items[0..@min(sources.items.len, indexed.entries.len)]) |part| a.free(part.bytes);
        sources.deinit(a);
    }
    try sources.ensureTotalCapacity(a, indexed.entries.len + 1);
    for (indexed.entries) |entry| sources.appendAssumeCapacity(.{
        .name = entry.name,
        .bytes = try indexed.decode(entry, 64 * 1024),
    });
    sources.appendAssumeCapacity(.{ .name = name, .bytes = data });
    return store.write(a, sources.items, .{});
}

test "HWPX native document insertion rejects binary, preview, namespace, duplicate IDs and protected parts" {
    const original = try constructor.create(a);
    defer a.free(original);
    for ([_][]const u8{ "BinData/image1.png", "Preview/PrvText.txt", "META-INF/signatures.xml" }) |path| {
        const unsupported = try appendPart(original, path, "opaque");
        defer a.free(unsupported);
        try std.testing.expectError(error.UnsupportedInsertPackage, insertion.prepare(a, original, unsupported, .{ .paragraph = 1, .unit = 0 }, .{}));
    }
    const namespace = try replace(original, section_path, "<hs:sec ", "<hs:sec xmlns:u=\"urn:alternate\" ");
    defer a.free(namespace);
    try std.testing.expectError(error.IncompatibleInsertNamespace, insertion.prepare(a, original, namespace, .{ .paragraph = 1, .unit = 0 }, .{}));

    const count = try replace(original, header_path, "<hh:charProperties itemCnt=\"1\">", "<hh:charProperties itemCnt=\"2\">");
    defer a.free(count);
    const duplicate = try replace(count, header_path, "</hh:charProperties>", "<hh:charPr id=\"0\"/></hh:charProperties>");
    defer a.free(duplicate);
    try std.testing.expectError(error.DuplicateResourceId, insertion.prepare(a, original, duplicate, .{ .paragraph = 1, .unit = 0 }, .{}));

    const encrypted = try appendPart(original, "META-INF/manifest.xml", "<m:manifest xmlns:m=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><m:file-entry full-path=\"settings.xml\" media-type=\"application/xml\"><m:encryption-data/></m:file-entry></m:manifest>");
    defer a.free(encrypted);
    try std.testing.expectError(error.EncryptedDocument, insertion.prepare(a, original, encrypted, .{ .paragraph = 1, .unit = 0 }, .{}));
}

test "HWPX native document insertion keeps different styles on the two destination sides" {
    const empty = try constructor.create(a);
    defer a.free(empty);
    const first = try textDocument(empty, "<hp:t>A</hp:t></hp:run><hp:run charPrIDRef=\"3\"><hp:t>😀B</hp:t>");
    defer a.free(first);
    const count = try replace(first, header_path, "<hh:charProperties itemCnt=\"1\">", "<hh:charProperties itemCnt=\"2\">");
    defer a.free(count);
    const destination = try replace(count, header_path, "</hh:charProperties>", "<hh:charPr id=\"3\" height=\"2200\" textColor=\"#004400\"/></hh:charProperties>");
    defer a.free(destination);
    const donor = try textDocument(empty, "<hp:t>삽입</hp:t>");
    defer a.free(donor);
    var result = try insertion.prepare(a, destination, donor, .{ .paragraph = 1, .unit = 3 }, .{});
    defer result.deinit(a);
    try expectTexts(result.bytes, &.{ "A😀", "삽입", "B" });
    var opened = try editor.open(a, result.bytes, .{});
    defer opened.deinit();
    const body = opened.sections[0].tree.source;
    try std.testing.expect(std.mem.indexOf(u8, body, "<hp:run charPrIDRef=\"3\"><hp:t>😀</hp:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, body, "<hp:run charPrIDRef=\"3\"><hp:t>B</hp:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, body, "<hp:run charPrIDRef=\"4\"><hp:t>삽입</hp:t>") != null);
}
