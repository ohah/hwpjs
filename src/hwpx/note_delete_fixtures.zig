//! Authored synthetic regression input, not a production note serializer.
//! Vocabulary observed in the pinned official public-UI raw outputs; resources
//! refer to the actual existing blank-document header, never assumed id 1.
const std = @import("std");
pub const foot = "<hp:ctrl><hp:footNote id=''><hp:subList id='' textDirection='HORIZONTAL' lineWrap='BREAK' vertAlign='TOP' linkListIDRef='0' linkListNextIDRef='0' textWidth='0' textHeight='0' hasTextRef='0' hasNumRef='0'><hp:p id='1' paraPrIDRef='0' styleIDRef='0' pageBreak='0' columnBreak='0' merged='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='1' numType='FOOTNOTE'><hp:autoNumFormat type='DIGIT' userChar='' prefixChar='' suffixChar=')' supscript='0'/></hp:autoNum></hp:ctrl><hp:t>각주 본문😀</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>";
pub const end = "<hp:ctrl><hp:endNote id=''><hp:subList id='' textDirection='HORIZONTAL' lineWrap='BREAK' vertAlign='TOP' linkListIDRef='0' linkListNextIDRef='0' textWidth='0' textHeight='0' hasTextRef='0' hasNumRef='0'><hp:p id='2' paraPrIDRef='0' styleIDRef='0' pageBreak='0' columnBreak='0' merged='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='1' numType='ENDNOTE'><hp:autoNumFormat type='DIGIT' userChar='' prefixChar='' suffixChar=')' supscript='0'/></hp:autoNum></hp:ctrl><hp:t>미주 본문😀</hp:t></hp:run></hp:p></hp:subList></hp:endNote></hp:ctrl>";
pub const foot_second = "<hp:ctrl><hp:footNote id=''><hp:subList id='' textDirection='HORIZONTAL' lineWrap='BREAK' vertAlign='TOP' linkListIDRef='0' linkListNextIDRef='0' textWidth='0' textHeight='0' hasTextRef='0' hasNumRef='0'><hp:p id='2' paraPrIDRef='0' styleIDRef='0' pageBreak='0' columnBreak='0' merged='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='2' numType='FOOTNOTE'><hp:autoNumFormat type='DIGIT' userChar='' prefixChar='' suffixChar=')' supscript='0'/></hp:autoNum></hp:ctrl><hp:t>두 번째 각주</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>";
pub const end_second = "<hp:ctrl><hp:endNote id=''><hp:subList id='' textDirection='HORIZONTAL' lineWrap='BREAK' vertAlign='TOP' linkListIDRef='0' linkListNextIDRef='0' textWidth='0' textHeight='0' hasTextRef='0' hasNumRef='0'><hp:p id='2' paraPrIDRef='0' styleIDRef='0' pageBreak='0' columnBreak='0' merged='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:autoNum num='2' numType='ENDNOTE'><hp:autoNumFormat type='DIGIT' userChar='' prefixChar='' suffixChar=')' supscript='0'/></hp:autoNum></hp:ctrl><hp:t>두 번째 미주</hp:t></hp:run></hp:p></hp:subList></hp:endNote></hp:ctrl>";
pub const continuous = "<hp:footNotePr><hp:autoNumFormat type='DIGIT' userChar='' prefixChar='' suffixChar=')' supscript='0'/><hp:noteLine length='-1' type='SOLID' width='0.12 mm' color='#000000'/><hp:noteSpacing betweenNotes='283' belowLine='567' aboveLine='850'/><hp:numbering type='CONTINUOUS' newNum='1'/><hp:placement place='EACH_COLUMN' beneathText='0'/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type='DIGIT' userChar='' prefixChar='' suffixChar=')' supscript='0'/><hp:noteLine length='-4' type='SOLID' width='0.12 mm' color='#000000'/><hp:noteSpacing betweenNotes='0' belowLine='567' aboveLine='850'/><hp:numbering type='CONTINUOUS' newNum='1'/><hp:placement place='END_OF_DOCUMENT' beneathText='0'/></hp:endNotePr>";
pub fn create(a: std.mem.Allocator, markers: []const u8, properties: []const u8) ![]u8 {
    const blank = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var archive = try @import("../zip/archive.zig").open(a, blank, .{});
    defer archive.deinit();
    const entry = archive.find("Contents/section0.xml").?;
    const raw = try archive.decode(entry, 1_000_000);
    defer a.free(raw);
    var tree = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
    defer tree.deinit(a);
    const uri = @import("document_xml.zig").paragraph_uri;
    var properties_at: ?usize = null;
    var markers_at: ?usize = null;
    for (tree.elements) |element| {
        if (element.is(uri, "secPr")) properties_at = element.end_tag.?.start;
        if (element.is(uri, "run")) markers_at = element.end_tag.?.start;
    }
    const at_properties = properties_at orelse return error.InvalidNoteTestFixture;
    const at_markers = markers_at orelse return error.InvalidNoteTestFixture;
    const section = try @import("xml_source_writer.zig").write(a, raw, &.{
        .{ .start = at_properties, .end = at_properties, .text = "", .serialized_xml = properties },
        .{ .start = at_markers, .end = at_markers, .text = "", .serialized_xml = markers },
    }, 1_000_000);
    defer a.free(section);
    var selected_index: ?usize = null;
    for (archive.entries, 0..) |candidate, index| {
        if (std.mem.eql(u8, candidate.name, "Contents/section0.xml")) selected_index = index;
    }
    const index = selected_index orelse return error.InvalidNoteTestFixture;
    return @import("../zip/replace_writer.zig").write(a, blank, &.{.{ .entry_index = index, .bytes = section }}, .{});
}
pub fn twoSections(a: std.mem.Allocator, markers: []const u8) ![]u8 {
    const with_notes = try create(a, markers, continuous);
    defer a.free(with_notes);
    const empty = try create(a, "", continuous);
    defer a.free(empty);
    var archive = try @import("../zip/archive.zig").open(a, with_notes, .{});
    defer archive.deinit();
    var blank = try @import("../zip/archive.zig").open(a, empty, .{});
    defer blank.deinit();
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const empty_section = try blank.decode(blank.find("Contents/section0.xml").?, 1_000_000);
    defer a.free(empty_section);
    var sources: std.ArrayList(@import("../zip/store_writer.zig").Source) = .empty;
    var note_section: ?[]const u8 = null;
    for (archive.entries) |entry| {
        const original = try archive.decode(entry, 1_000_000);
        const raw = try scratch.dupe(u8, original);
        a.free(original);
        var bytes: []const u8 = raw;
        if (std.mem.eql(u8, entry.name, "Contents/section0.xml")) {
            note_section = raw;
            bytes = empty_section;
        } else if (std.mem.eql(u8, entry.name, "Contents/header.xml")) {
            var tree = try @import("header_tree.zig").parse(scratch, raw, 0, .{});
            defer tree.deinit(scratch);
            const tag = try @import("xml_scalar_attributes_upsert.zig").write(scratch, &tree, 0, &.{"secCnt"}, .{"2"}, 1_000_000);
            bytes = try @import("xml_source_writer.zig").write(scratch, raw, &.{.{ .start = tree.elements[0].start_tag.start, .end = tree.elements[0].start_tag.end, .text = "", .serialized_xml = tag }}, 1_000_000);
        } else if (std.mem.eql(u8, entry.name, "Contents/content.hpf")) {
            const manifest_at = std.mem.indexOf(u8, raw, "</opf:manifest>") orelse return error.InvalidNoteTestFixture;
            const spine_at = std.mem.indexOf(u8, raw, "</opf:spine>") orelse return error.InvalidNoteTestFixture;
            bytes = try @import("xml_source_writer.zig").write(scratch, raw, &.{
                .{ .start = manifest_at, .end = manifest_at, .text = "", .serialized_xml = "<opf:item id='section1' href='Contents/section1.xml' media-type='application/xml'/>" },
                .{ .start = spine_at, .end = spine_at, .text = "", .serialized_xml = "<opf:itemref idref='section1'/>" },
            }, 1_000_000);
        }
        try sources.append(scratch, .{ .name = entry.name, .bytes = bytes });
    }
    try sources.append(scratch, .{ .name = "Contents/section1.xml", .bytes = note_section orelse return error.InvalidNoteTestFixture });
    return @import("../zip/store_writer.zig").write(a, sources.items, .{});
}
