//! Authored structural negative fixtures only; no live Session field mutation.
const std = @import("std");
const editor = @import("editor_session.zig");
const fixture = @import("note_delete_fixtures.zig");
const hp = @import("document_xml.zig").paragraph_uri;
pub const prior = "<hp:p id='98765' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:t>priorredo</hp:t></hp:run></hp:p>";
pub fn replacePart(a: std.mem.Allocator, input: []const u8, entry: usize, xml: []const u8) ![]u8 {
    return @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = entry, .bytes = xml }}, .{});
}
pub fn withOutside(a: std.mem.Allocator, input: []const u8, prefix: []const u8, suffix: []const u8) ![]u8 {
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const first = section.tree.elements[0].first_child orelse return error.InvalidNoteTestFixture;
    const root_end = section.tree.elements[0].end_tag.?.start;
    const xml = try @import("xml_source_writer.zig").write(a, section.tree.source, &.{
        .{ .start = section.tree.elements[first].start_tag.start, .end = section.tree.elements[first].start_tag.start, .text = "", .serialized_xml = prefix },
        .{ .start = root_end, .end = root_end, .text = "", .serialized_xml = suffix },
    }, 1_000_000);
    defer a.free(xml);
    return replacePart(a, input, section.entry_index, xml);
}
pub fn base(a: std.mem.Allocator, markers: []const u8) ![]u8 {
    const input = try fixture.create(a, markers, fixture.continuous);
    defer a.free(input);
    return withOutside(a, input, "", prior);
}
pub fn lock(a: std.mem.Allocator, input: []const u8, note_ordinal: usize, local: []const u8, lexical: []const u8) ![]u8 {
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const tree = &section.tree;
    var found: ?usize = null;
    var ordinal: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(hp, "footNote")) continue;
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
        if (element.is(hp, local)) {
            selected = index;
            break;
        }
    }
    const target = selected orelse return error.InvalidNoteTestFixture;
    const tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, target, &.{"lock"}, .{lexical}, 1_000_000);
    defer a.free(tag);
    const span = tree.elements[target].start_tag;
    const xml = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, 1_000_000);
    defer a.free(xml);
    return replacePart(a, input, section.entry_index, xml);
}
pub fn resourceLock(a: std.mem.Allocator, input: []const u8, local: []const u8, lexical: []const u8) ![]u8 {
    var doc = try @import("package.zig").inspectDocument(a, input, .{});
    defer doc.deinit(a);
    var header = try doc.readHeaderTree(a, .{});
    defer header.deinit(a);
    var target: ?usize = null;
    for (header.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").head_uri, local)) {
            target = index;
            break;
        }
    }
    const index = target orelse return error.InvalidNoteTestFixture;
    const tag = try @import("xml_scalar_attributes_upsert.zig").write(a, &header, index, &.{"lock"}, .{lexical}, 1_000_000);
    defer a.free(tag);
    const span = header.elements[index].start_tag;
    const xml = try @import("xml_source_writer.zig").write(a, header.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, 1_000_000);
    defer a.free(xml);
    const entry = doc.manifest.items[header.item_index].entry_index orelse return error.InvalidNoteTestFixture;
    return replacePart(a, input, entry, xml);
}
pub fn unreferencedStyleLock(a: std.mem.Allocator, input: []const u8, lexical: []const u8) ![]u8 {
    var doc = try @import("package.zig").inspectDocument(a, input, .{});
    defer doc.deinit(a);
    var header = try doc.readHeaderTree(a, .{});
    defer header.deinit(a);
    const hh = @import("document_xml.zig").head_uri;
    var selected: ?usize = null;
    for (header.elements, 0..) |element, index| if (element.is(hh, "style")) {
        selected = index;
        break;
    };
    const style = selected orelse return error.InvalidNoteTestFixture;
    const group = header.elements[style].parent orelse return error.InvalidNoteTestFixture;
    const tag = try @import("xml_scalar_attributes_upsert.zig").write(a, &header, style, &.{ "id", "lock" }, .{ "99", lexical }, 1_000_000);
    defer a.free(tag);
    const copy = try std.fmt.allocPrint(a, "{s}{s}", .{ tag, header.source[header.elements[style].start_tag.end..header.elements[style].end] });
    defer a.free(copy);
    const old_count = (try @import("table_xml_fields.zig").optionalUnsigned(a, &header, group, "itemCnt", 4096)) orelse return error.InvalidNoteTestFixture;
    const count = try std.fmt.allocPrint(a, "{d}", .{try std.math.add(u32, old_count, 1)});
    defer a.free(count);
    const group_tag = try @import("xml_scalar_attributes_upsert.zig").write(a, &header, group, &.{"itemCnt"}, .{count}, 1_000_000);
    defer a.free(group_tag);
    const group_span = header.elements[group].start_tag;
    const at = header.elements[group].end_tag.?.start;
    const xml = try @import("xml_source_writer.zig").write(a, header.source, &.{
        .{ .start = group_span.start, .end = group_span.end, .text = "", .serialized_xml = group_tag },
        .{ .start = at, .end = at, .text = "", .serialized_xml = copy },
    }, 1_000_000);
    defer a.free(xml);
    const entry = doc.manifest.items[header.item_index].entry_index orelse return error.InvalidNoteTestFixture;
    return replacePart(a, input, entry, xml);
}
pub fn prefixField(a: std.mem.Allocator, input: []const u8, matched: bool) ![]u8 {
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const tree = &section.tree;
    var note_count: usize = 0;
    var number_node: ?usize = null;
    var active = false;
    for (tree.elements, 0..) |element, index| {
        if (element.is(hp, "footNote")) {
            note_count += 1;
            active = note_count == 2;
        }
        if (active and element.is(hp, "autoNum")) {
            number_node = index;
            break;
        }
    }
    const number = number_node orelse return error.InvalidNoteTestFixture;
    const wrapper = tree.elements[number].parent orelse return error.InvalidNoteTestFixture;
    const control = tree.elements[wrapper];
    const xml = try @import("xml_source_writer.zig").write(a, tree.source, &.{
        .{ .start = control.start_tag.start, .end = control.start_tag.start, .text = "", .serialized_xml = "<hp:ctrl><hp:fieldBegin id='991' type='HYPERLINK' editable='0'/></hp:ctrl>" },
        .{ .start = control.end, .end = control.end, .text = "", .serialized_xml = if (matched) "<hp:ctrl><hp:fieldEnd beginIDRef='991'/></hp:ctrl>" else "" },
    }, 1_000_000);
    defer a.free(xml);
    return replacePart(a, input, section.entry_index, xml);
}
/// Uses the existing complete image insertion factory and an owned 1x1 PNG.
/// No malformed stand-in picture or missing image/manifest resource is used.
pub fn withPicture(a: std.mem.Allocator, cache: []const u8, lexical: []const u8) ![]u8 {
    const blank = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(blank);
    const png = try @import("../image/png/rgba_fixture.zig").image(a, 1, 1, 8, 6, 0, &.{ 0, 0, 0, 0, 255 }, null, null);
    defer a.free(png);
    var inserted = try @import("image_insertion_file.zig").prepare(a, blank, png, .{ .expected_source_sha256 = @import("note_removal_plan.zig").digest(blank), .target = .{ .section = 0, .paragraph = 1, .unit = 0 }, .expected_text = "", .width = 100, .height = 100 });
    defer inserted.deinit(a);
    var image_session = try editor.open(a, inserted.bytes, .{});
    defer image_session.deinit();
    const tree = &image_session.sections[0].tree;
    var picture: ?usize = null;
    for (tree.elements, 0..) |element, index| if (element.is(hp, "pic")) {
        picture = index;
    };
    const node = picture orelse return error.InvalidNoteTestFixture;
    const changed_tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, node, &.{"lock"}, .{lexical}, 100_000);
    defer a.free(changed_tag);
    const element = tree.elements[node];
    const fragment = try std.fmt.allocPrint(a, "{s}{s}", .{ changed_tag, tree.source[element.start_tag.end..element.end] });
    defer a.free(fragment);
    const outside = try std.fmt.allocPrint(a, "<hp:p id='98766' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'>{s}<hp:t>outside picture</hp:t></hp:run>{s}</hp:p>", .{ fragment, cache });
    defer a.free(outside);
    const notes = try base(a, fixture.foot);
    defer a.free(notes);
    const combined = try withOutside(a, notes, "", outside);
    defer a.free(combined);
    var combined_zip = try @import("../zip/archive.zig").open(a, combined, .{});
    defer combined_zip.deinit();
    const combined_xml = try combined_zip.decode(combined_zip.find("Contents/section0.xml").?, 1_000_000);
    defer a.free(combined_xml);
    return replacePart(a, inserted.bytes, image_session.sections[0].entry_index, combined_xml);
}
