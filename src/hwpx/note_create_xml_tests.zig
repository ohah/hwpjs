//! Serializer-only regressions, not package creation/History evidence.
const std = @import("std");
const api = @import("note_create_xml.zig");
const Kind = @import("note_bodies.zig").Kind;
const sample_text = " 앞😀<&amp;>\r\n끝 ";
fn inputFor(kind: Kind) api.profile.Input {
    return .{ .kind = kind, .paragraph_id = 37, .resources = .{ .paragraph = 0, .character = 0, .style = 0 }, .number = 7, .format = .{ .number_type = "DIGIT", .user_char = "", .prefix_char = "<앞&\"", .suffix_char = ")😀\r\n", .superscript = false }, .body = sample_text };
}
fn resourcesFor(a: std.mem.Allocator) !@import("header_resources.zig").Report {
    const blank = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var archive = try @import("../zip/archive.zig").open(a, blank, .{});
    defer archive.deinit();
    return @import("header_resources.zig").read(a, archive, archive.find("Contents/header.xml").?, .{});
}
fn fragmentCase(a: std.mem.Allocator, kind: Kind) !void {
    var resources = try resourcesFor(a);
    defer resources.deinit(a);
    const input = inputFor(kind);
    const xml = try api.create(a, input, &resources, .{});
    defer a.free(xml);
    try std.testing.expect(std.mem.indexOf(u8, xml, "instId") == null);
    const source = try std.fmt.allocPrint(a, "<hs:sec xmlns:hs='http://www.hancom.co.kr/hwpml/2011/section' xmlns:hp='http://www.hancom.co.kr/hwpml/2011/paragraph'><hp:p><hp:run>{s}</hp:run></hp:p></hs:sec>", .{xml});
    defer a.free(source);
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var notes = try @import("note_bodies.zig").inspect(a, &.{tree}, .{});
    defer notes.deinit();
    try std.testing.expectEqual(@as(usize, 1), notes.notes.len);
    try std.testing.expectEqual(kind, notes.notes[0].kind);
    try std.testing.expectEqualStrings("", notes.notes[0].attributes.get(.id).?);
    try std.testing.expectEqual(@as(usize, 1), notes.notes[0].sub_list_count);
    const owner = try @import("note_mutation_owner.zig").read(&tree, notes.notes[0].element_index);
    try std.testing.expectEqual(@as(usize, 1), owner.direct_paragraphs);
    var numbers = try @import("number_controls.zig").inspect(a, &.{tree}, .{});
    defer numbers.deinit();
    try std.testing.expectEqual(@as(usize, 1), numbers.controls.len);
    try std.testing.expectEqual(@as(?i32, 7), numbers.controls[0].auto.?.num);
    try std.testing.expectEqualStrings(if (kind == .foot) "FOOTNOTE" else "ENDNOTE", numbers.controls[0].auto.?.get(.num_type).?);
    try std.testing.expectEqualStrings(input.format.prefix_char, numbers.formats[0].attributes.get(.prefix_char).?);
    try std.testing.expectEqualStrings(input.format.suffix_char, numbers.formats[0].attributes.get(.suffix_char).?);
    const uri = @import("document_xml.zig").paragraph_uri;
    var texts: usize = 0;
    for (tree.elements) |element| {
        if (!element.is(uri, "t")) continue;
        const raw = tree.source[element.start_tag.end..element.end_tag.?.start];
        const decoded = try (@import("../xml/text_content.zig").View{ .kind = .char_data, .raw = raw, .encoding = .utf8, .scalars = 0, .reference_options = .{} }).toUtf8(a, 10000);
        defer a.free(decoded);
        try std.testing.expectEqualStrings(sample_text, decoded);
        texts += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), texts);
}
test "HWPX N02 create footnote fragment reads exact typed resources number format and text" {
    try fragmentCase(std.testing.allocator, .foot);
}
test "HWPX N02 create endnote fragment reads exact typed resources number format and text" {
    try fragmentCase(std.testing.allocator, .end);
}
test "HWPX N02 create fragment allocation failures release every encoded field" {
    try @import("../testing/allocation_failures.zig").check(fragmentCase, .{Kind.foot});
}
test "HWPX N02 create fragment rejects unknown resources invalid number format text and bounds" {
    const a = std.testing.allocator;
    var resources = try resourcesFor(a);
    defer resources.deinit(a);
    var input = inputFor(.foot);
    input.resources.paragraph = 99;
    try std.testing.expectError(error.InvalidParagraphShapeReference, api.create(a, input, &resources, .{}));
    input = inputFor(.foot);
    input.resources.character = 99;
    try std.testing.expectError(error.InvalidCharacterShapeReference, api.create(a, input, &resources, .{}));
    input = inputFor(.foot);
    input.resources.style = 99;
    try std.testing.expectError(error.InvalidStyleReference, api.create(a, input, &resources, .{}));
    input = inputFor(.foot);
    input.number = 0;
    try std.testing.expectError(error.InvalidNoteCreateNumber, api.create(a, input, &resources, .{}));
    input = inputFor(.foot);
    input.format.number_type = "pretendNumber";
    try std.testing.expectError(error.InvalidNoteCreateNumberFormat, api.create(a, input, &resources, .{}));
    input = inputFor(.foot);
    input.body = "\x00";
    try std.testing.expectError(error.InvalidXmlCharacter, api.create(a, input, &resources, .{}));
    input.body = "\xff";
    try std.testing.expectError(error.InvalidXmlEncoding, api.create(a, input, &resources, .{}));
    input = inputFor(.foot);
    try std.testing.expectError(error.LimitExceeded, api.create(a, input, &resources, .{ .max_text_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, api.create(a, input, &resources, .{ .max_xml_bytes = 10 }));
}
