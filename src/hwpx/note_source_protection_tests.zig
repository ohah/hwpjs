//! New protection regressions only. No Native execution grant accompanies them.
const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const api = @import("note_delete.zig");
const fixtures = @import("note_protection_fixtures.zig");
const note_fixture = @import("note_delete_fixtures.zig");
const a = std.testing.allocator;
fn firstNote(session: *const editor.Session) !api.owners.Selector {
    for (session.sections, 0..) |section, ordinal| for (section.tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "footNote")) return .{ .section = ordinal, .note_node = index };
    };
    return error.MissingTestNote;
}
fn command(request: *const api.Request) histories.Command {
    return .{ .kind = .note_delete, .section = request.selector.section, .paragraph = request.paragraph, .start = @intCast(request.anchor_unit), .deleted = 0, .inserted = "", .note_delete = request };
}
fn expectedError(result: anytype, expected: anyerror) !void {
    if (result) |_| return error.TestExpectedError else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expect(err == expected);
    }
}
fn refusal(allocator: std.mem.Allocator, input: []const u8, expected: anyerror, at_query: bool) !void {
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const rows = try @import("paragraph_text_snapshot.zig").read(allocator, &session, 0);
    defer @import("paragraph_text_snapshot.zig").free(allocator, rows);
    var prior_paragraph: ?usize = null;
    for (rows) |row| if (std.mem.eql(u8, row.text, "priorredo")) {
        prior_paragraph = row.paragraph;
    };
    try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .paragraph = prior_paragraph orelse return error.MissingTestRedoParagraph, .start = 0, .deleted = 0, .inserted = "R" }));
    const redo_bytes = try session.save();
    defer allocator.free(redo_bytes);
    try std.testing.expect(try history.undo(&session));
    const before = try session.save();
    defer allocator.free(before);
    const revision = history.revision();
    const serial = session.mutation_serial;
    const pointer = session.source.ptr;
    if (at_query) {
        try expectedError(api.owners.observe(allocator, &session, try firstNote(&session), revision), expected);
    } else {
        const request = try api.owners.observe(allocator, &session, try firstNote(&session), revision);
        try expectedError(history.apply(&session, command(&request)), expected);
    }
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expectEqual(serial, session.mutation_serial);
    try std.testing.expectEqual(pointer, session.source.ptr);
    const after = try session.save();
    defer allocator.free(after);
    try otherPartsAndPictures(allocator, before, after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer allocator.free(redone);
    try std.testing.expectEqualSlices(u8, redo_bytes, redone);
}
fn otherPartsAndPictures(allocator: std.mem.Allocator, before: []const u8, after: []const u8) !void {
    var before_archive = try @import("../zip/archive.zig").open(allocator, before, .{});
    defer before_archive.deinit();
    var after_archive = try @import("../zip/archive.zig").open(allocator, after, .{});
    defer after_archive.deinit();
    try std.testing.expectEqual(before_archive.entries.len, after_archive.entries.len);
    for (before_archive.entries) |entry| {
        if (std.mem.eql(u8, entry.name, "Contents/section0.xml")) continue;
        const previous = try before_archive.decode(entry, 4_000_000);
        defer allocator.free(previous);
        const next = try after_archive.decode(after_archive.find(entry.name) orelse return error.TestExpectedPart, 4_000_000);
        defer allocator.free(next);
        try std.testing.expectEqualSlices(u8, previous, next);
    }
    const original_xml = try before_archive.decode(before_archive.find("Contents/section0.xml").?, 1_000_000);
    defer allocator.free(original_xml);
    const changed_xml = try after_archive.decode(after_archive.find("Contents/section0.xml").?, 1_000_000);
    defer allocator.free(changed_xml);
    var original_tree = try @import("section_tree.zig").parse(allocator, original_xml, 0, 0, .{});
    defer original_tree.deinit(allocator);
    var changed_tree = try @import("section_tree.zig").parse(allocator, changed_xml, 0, 0, .{});
    defer changed_tree.deinit(allocator);
    var original_pictures: std.ArrayList([]const u8) = .empty;
    defer original_pictures.deinit(allocator);
    var changed_pictures: std.ArrayList([]const u8) = .empty;
    defer changed_pictures.deinit(allocator);
    const uri = @import("document_xml.zig").paragraph_uri;
    for (original_tree.elements, 0..) |element, index| if (element.is(uri, "pic")) try original_pictures.append(allocator, original_tree.sourceOf(index));
    for (changed_tree.elements, 0..) |element, index| if (element.is(uri, "pic")) try changed_pictures.append(allocator, changed_tree.sourceOf(index));
    try std.testing.expectEqual(original_pictures.items.len, changed_pictures.items.len);
    for (original_pictures.items, changed_pictures.items) |previous, next| try std.testing.expectEqualSlices(u8, previous, next);
}
fn success(allocator: std.mem.Allocator, input: []const u8) !void {
    return successKeeping(allocator, input, "");
}
fn successKeeping(allocator: std.mem.Allocator, input: []const u8, retained: []const u8) !void {
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const before = try session.save();
    defer allocator.free(before);
    const request = try api.owners.observe(allocator, &session, try firstNote(&session), history.revision());
    try std.testing.expect(try history.apply(&session, command(&request)));
    const after = try session.save();
    defer allocator.free(after);
    try otherPartsAndPictures(allocator, before, after);
    if (retained.len != 0) {
        var archive = try @import("../zip/archive.zig").open(allocator, after, .{});
        defer archive.deinit();
        const section = try archive.decode(archive.find("Contents/section0.xml").?, 1_000_000);
        defer allocator.free(section);
        try std.testing.expect(std.mem.indexOf(u8, section, retained) != null);
    }
    var reopened = try editor.open(allocator, after, .{});
    defer reopened.deinit();
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer allocator.free(restored);
    try std.testing.expectEqualSlices(u8, before, restored);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer allocator.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "HWPX N02 delete protection selected six descendant locks reject without publication or redo loss" {
    const base = try fixtures.base(a, note_fixture.foot);
    defer a.free(base);
    for ([_][]const u8{ "subList", "p", "run", "ctrl", "autoNum", "t" }) |local| {
        for ([_][]const u8{ "1", "true", "2", "malformed" }) |lexical| {
            const input = try fixtures.lock(a, base, 0, local, lexical);
            defer a.free(input);
            try refusal(a, input, if (std.mem.eql(u8, lexical, "1") or std.mem.eql(u8, lexical, "true")) error.NoteDeleteReadOnly else error.InvalidXmlBoolean, true);
        }
    }
}
test "HWPX N02 delete protection selected six zero false locks retain normal lifecycle" {
    const base = try fixtures.base(a, note_fixture.foot);
    defer a.free(base);
    for ([_][]const u8{ "subList", "p", "run", "ctrl", "autoNum", "t" }) |local| {
        for ([_][]const u8{ "0", "false" }) |lexical| {
            const input = try fixtures.lock(a, base, 0, local, lexical);
            defer a.free(input);
            try success(a, input);
        }
    }
}
test "HWPX N02 delete protection actual format descendant lock is included" {
    const base = try fixtures.base(a, note_fixture.foot);
    defer a.free(base);
    const input = try fixtures.lock(a, base, 0, "autoNumFormat", "1");
    defer a.free(input);
    try refusal(a, input, error.NoteDeleteReadOnly, true);
}
test "HWPX N02 renumber matched inner prefix field refuses actual number write and preserves prior redo" {
    const base = try fixtures.base(a, note_fixture.foot ++ note_fixture.foot_second);
    defer a.free(base);
    const input = try fixtures.prefixField(a, base, true);
    defer a.free(input);
    try refusal(a, input, error.ProtectedFieldRange, false);
}
test "HWPX N02 renumber unresolved inner prefix field refuses without guessing a closing marker" {
    const base = try fixtures.base(a, note_fixture.foot ++ note_fixture.foot_second);
    defer a.free(base);
    const input = try fixtures.prefixField(a, base, false);
    defer a.free(input);
    try refusal(a, input, error.ProtectedFieldRange, false);
}
test "HWPX N02 renumber actual number and body ancestor locks refuse with full bytes and redo intact" {
    const base = try fixtures.base(a, note_fixture.foot ++ note_fixture.foot_second);
    defer a.free(base);
    for ([_][]const u8{ "autoNum", "ctrl", "run", "p", "subList" }) |local| {
        for ([_][]const u8{ "1", "malformed" }) |lexical| {
            const input = try fixtures.lock(a, base, 1, local, lexical);
            defer a.free(input);
            try refusal(a, input, if (std.mem.eql(u8, lexical, "1")) error.NoteDeleteReadOnly else error.InvalidXmlBoolean, false);
        }
    }
}
test "HWPX N02 selected referenced style paragraph character resources respect explicit readonly locks" {
    const base = try fixtures.base(a, note_fixture.foot);
    defer a.free(base);
    for ([_][]const u8{ "style", "paraPr", "charPr", "styles" }) |local| {
        for ([_][]const u8{ "1", "malformed", "0", "false" }) |lexical| {
            const input = try fixtures.resourceLock(a, base, local, lexical);
            defer a.free(input);
            if (std.mem.eql(u8, lexical, "0") or std.mem.eql(u8, lexical, "false")) try success(a, input) else try refusal(a, input, if (std.mem.eql(u8, lexical, "1")) error.NoteDeleteReadOnly else error.InvalidXmlBoolean, true);
        }
    }
}
test "HWPX N02 delete protection OOM preserves bound owner and field refusal redo state" {
    const base = try fixtures.base(a, note_fixture.foot ++ note_fixture.foot_second);
    defer a.free(base);
    const input = try fixtures.prefixField(a, base, true);
    defer a.free(input);
    try @import("../testing/allocation_failures.zig").check(refusal, .{ input, @as(anyerror, error.ProtectedFieldRange), false });
}
test "HWPX N02 delete protection unrelated locked known unknown caches remain exact at prefix and suffix" {
    const base = try fixtures.base(a, note_fixture.foot);
    defer a.free(base);
    for ([_][]const u8{
        "<hp:linesegarray><hp:lineseg textpos='0' vertpos='0' vertsize='100' textheight='100' baseline='80' spacing='0' horzpos='0' horzsize='500' flags='0'/></hp:linesegarray>",
        "<hp:linesegarray xmlns:x='urn:opaque' x:keep='yes'><x:leaf/></hp:linesegarray>",
    }) |cache| for ([_][]const u8{ "1", "malformed" }) |lexical| {
        const outside = try std.fmt.allocPrint(a, "<hp:p id='98766' paraPrIDRef='0' styleIDRef='0' lock='{s}'><hp:run charPrIDRef='0'><hp:t>outside</hp:t></hp:run>{s}</hp:p>", .{ lexical, cache });
        defer a.free(outside);
        for ([_]bool{ true, false }) |prefix| {
            const input = try fixtures.withOutside(a, base, if (prefix) outside else "", if (prefix) "" else outside);
            defer a.free(input);
            try successKeeping(a, input, outside);
        }
    };
}
test "HWPX N02 delete protection unrelated note body lock and opaque cache are preserved" {
    const base = try fixtures.base(a, note_fixture.foot);
    defer a.free(base);
    const outside = "<hp:p id='98766' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:endNote id=''><hp:subList id=''><hp:p id='98767' paraPrIDRef='0' styleIDRef='0' lock='malformed'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='1' numType='ENDNOTE'/></hp:ctrl><hp:t>outside</hp:t></hp:run><hp:linesegarray xmlns:x='urn:opaque' x:keep='yes'><x:leaf/></hp:linesegarray></hp:p></hp:subList></hp:endNote></hp:ctrl></hp:run></hp:p>";
    const input = try fixtures.withOutside(a, base, "", outside);
    defer a.free(input);
    try successKeeping(a, input, outside);
}
test "HWPX N02 renumber proof resolves the actual internal current paragraph not the body reference" {
    const input = try fixtures.base(a, note_fixture.foot ++ note_fixture.foot_second);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const selected = try firstNote(&session);
    const reference = try api.owners.observe(a, &session, selected, 0);
    const updates = try @import("note_delete_numbering.zig").prepare(a, &session, selected, .foot);
    defer a.free(updates);
    try std.testing.expectEqual(@as(usize, 1), updates.len);
    try std.testing.expect(updates[0].current_prefix_paragraph != null);
    try std.testing.expect(updates[0].current_prefix_paragraph.? != reference.paragraph);
    const context = (try @import("note_paragraph_context.zig").read(&session.sections[0].tree, updates[0].paragraph_node)).?;
    try std.testing.expectEqual(updates[0].note_node, context.note_node);
}
test "HWPX N02 delete protection unrelated matched or unresolved other note fields remain exact" {
    const base = try fixtures.base(a, note_fixture.foot);
    defer a.free(base);
    for ([_]bool{ true, false }) |matched| {
        const outside = try std.fmt.allocPrint(a, "<hp:p id='98766' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:endNote id=''><hp:subList id=''><hp:p id='98767' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='1' numType='ENDNOTE'/></hp:ctrl><hp:ctrl><hp:fieldBegin id='992' type='HYPERLINK' editable='0'/></hp:ctrl><hp:t>outside protected text</hp:t>{s}</hp:run></hp:p></hp:subList></hp:endNote></hp:ctrl></hp:run></hp:p>", .{if (matched) "<hp:ctrl><hp:fieldEnd beginIDRef='992'/></hp:ctrl>" else ""});
        defer a.free(outside);
        const input = try fixtures.withOutside(a, base, "", outside);
        defer a.free(input);
        try successKeeping(a, input, outside);
    }
}
test "HWPX N02 delete protection unrelated actual picture resources and known unknown caches remain exact" {
    for ([_][]const u8{
        "<hp:linesegarray><hp:lineseg textpos='0' vertpos='0' vertsize='100' textheight='100' baseline='80' spacing='0' horzpos='0' horzsize='500' flags='0'/></hp:linesegarray>",
        "<hp:linesegarray xmlns:x='urn:opaque' x:keep='yes'><x:leaf/></hp:linesegarray>",
    }) |cache| for ([_][]const u8{ "1", "malformed" }) |lexical| {
        const input = try @import("note_picture_plain_fixture.zig").withPicturePlain(a, cache, lexical);
        defer a.free(input);
        try successKeeping(a, input, "outside picture");
    };
}
test "HWPX N02 delete protection unreferenced locked or malformed style does not reject the document" {
    const base = try fixtures.base(a, note_fixture.foot);
    defer a.free(base);
    for ([_][]const u8{ "1", "malformed" }) |lexical| {
        const input = try fixtures.unreferencedStyleLock(a, base, lexical);
        defer a.free(input);
        try success(a, input);
    }
}
test "HWPX N02 protection resource classifier retains direct canonical header descriptor ownership" {
    const hh = @import("document_xml.zig").head_uri;
    var header = try @import("header_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:foreign'><h:refList><h:styles><h:style id='0'/><x:style id='1'/><h:style id='2'><h:style id='3'/></h:style></h:styles><h:paraProperties><h:paraPr id='0'/></h:paraProperties><h:charProperties><h:charPr id='0'/></h:charProperties><x:styles><h:style id='4'/></x:styles></h:refList></h:head>", 0, .{});
    defer header.deinit(a);
    const resources = @import("header_resources.zig");
    var valid: usize = 0;
    for (header.elements, 0..) |element, index| {
        const kind = resources.kindAt(&header, index);
        if (element.is(hh, "paraPr")) {
            try std.testing.expectEqual(resources.Kind.para_shape, kind.?);
            valid += 1;
        } else if (element.is(hh, "charPr")) {
            try std.testing.expectEqual(resources.Kind.char_shape, kind.?);
            valid += 1;
        } else if (element.is(hh, "style") and element.parent != null and header.elements[element.parent.?].is(hh, "styles")) {
            try std.testing.expectEqual(resources.Kind.style, kind.?);
            valid += 1;
        } else try std.testing.expect(kind == null);
    }
    try std.testing.expectEqual(@as(usize, 4), valid);
    try std.testing.expect(resources.kindAt(&header, header.elements.len) == null);
}

fn followingNumberAttribute(allocator: std.mem.Allocator, input: []const u8, comptime attribute: []const u8, lexical: []const u8) ![]u8 {
    const note_ordinal: usize = 1;
    const local = "autoNum";
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const tree = &section.tree;
    var found: ?usize = null;
    var ordinal: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "footNote")) continue;
        if (ordinal == note_ordinal) {
            found = index;
            break;
        }
        ordinal += 1;
    }
    const root = found orelse return error.InvalidNoteTestFixture;
    var selected: ?usize = null;
    for (tree.elements[root + 1 ..], root + 1..) |element, index| {
        if (element.start_tag.start >= tree.elements[root].end) break;
        if (element.is(@import("document_xml.zig").paragraph_uri, local)) {
            selected = index;
            break;
        }
    }
    const target = selected orelse return error.InvalidNoteTestFixture;
    const tag = try @import("xml_scalar_attributes_upsert.zig").write(allocator, tree, target, &.{attribute}, .{lexical}, 1_000_000);
    defer allocator.free(tag);
    const span = tree.elements[target].start_tag;
    const xml = try @import("xml_source_writer.zig").write(allocator, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, 1_000_000);
    defer allocator.free(xml);
    return fixtures.replacePart(allocator, input, section.entry_index, xml);
}
test "HWPX N02 renumber protection precedes unsupported number attributes" {
    const base = try fixtures.base(a, note_fixture.foot ++ note_fixture.foot_second);
    defer a.free(base);
    const unknown = try followingNumberAttribute(a, base, "n02Unknown", "keep");
    defer a.free(unknown);
    for ([_][]const u8{ "autoNum", "ctrl", "run", "p", "subList" }) |local| {
        for ([_][]const u8{ "1", "true", "2", "malformed" }) |lexical| {
            const input = try fixtures.lock(a, unknown, 1, local, lexical);
            defer a.free(input);
            try refusal(a, input, if (std.mem.eql(u8, lexical, "1") or std.mem.eql(u8, lexical, "true")) error.NoteDeleteReadOnly else error.InvalidXmlBoolean, false);
        }
    }
}
test "HWPX N02 renumber unlocked unknown number attributes remain unsupported" {
    const base = try fixtures.base(a, note_fixture.foot ++ note_fixture.foot_second);
    defer a.free(base);
    const unknown = try followingNumberAttribute(a, base, "n02Unknown", "keep");
    defer a.free(unknown);
    try refusal(a, unknown, error.UnsupportedNoteNumberUpdate, false);
    for ([_][]const u8{ "0", "false" }) |lexical| {
        const input = try fixtures.lock(a, unknown, 1, "autoNum", lexical);
        defer a.free(input);
        try refusal(a, input, error.UnsupportedNoteNumberUpdate, false);
    }
}
test "HWPX N02 renumber field envelope precedes unsupported number attributes" {
    const base = try fixtures.base(a, note_fixture.foot ++ note_fixture.foot_second);
    defer a.free(base);
    const unknown = try followingNumberAttribute(a, base, "n02Unknown", "keep");
    defer a.free(unknown);
    for ([_]bool{ true, false }) |matched| {
        const input = try fixtures.prefixField(a, unknown, matched);
        defer a.free(input);
        try refusal(a, input, error.ProtectedFieldRange, false);
    }
}
