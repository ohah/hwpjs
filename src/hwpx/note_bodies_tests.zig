const std = @import("std");
const section_tree = @import("section_tree.zig");
const notes = @import("note_bodies.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";
fn inspect(a: std.mem.Allocator, inner: []const u8, options: notes.Options) !notes.Report {
    const source = try std.mem.concat(a, u8, &.{ prefix, inner, suffix });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return notes.inspect(a, &.{tree}, options);
}

test "HWPX note bodies own note and ParaListType fields and paragraph order" {
    var report = try inspect(std.testing.allocator, "<p:ctrl><p:footNote id='' flag='385' number='01' userChar='42' prefixChar='47928' suffixChar='41' instId='8' future='x'>" ++
        "<p:subList id='' textDirection='HORIZONTAL' lineWrap='BREAK' vertAlign='TOP' linkListIDRef='0' linkListNextIDRef='0' textWidth='0' textHeight='0' hasTextRef='0' hasNumRef='0'><p:p id='1'/><p:p id='2'/></p:subList>" ++
        "</p:footNote><p:endNote number='2' instId='9'><p:subList><p:p id='3'/></p:subList></p:endNote></p:ctrl>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.notes.len);
    try std.testing.expectEqual(@as(usize, 2), report.sub_lists.len);
    try std.testing.expectEqual(@as(usize, 3), report.paragraphs.len);
    try std.testing.expectEqual(@as(usize, 1), report.foot_notes);
    try std.testing.expectEqual(@as(usize, 1), report.end_notes);
    try std.testing.expectEqualStrings("ctrl", report.notes[0].parent_local_name);
    try std.testing.expectEqualStrings("", report.notes[0].attributes.get(.id).?);
    try std.testing.expectEqualStrings("01", report.notes[0].attributes.get(.number).?);
    try std.testing.expectEqual(@as(?u16, 1), report.notes[0].attributes.number);
    try std.testing.expectEqual(@as(?u32, 385), report.notes[0].attributes.flag);
    try std.testing.expectEqual(@as(?u16, 47928), report.notes[0].attributes.prefix_char);
    try std.testing.expectEqual(@as(usize, 1), report.other_attributes);
    try std.testing.expectEqualStrings("HORIZONTAL", report.sub_lists[0].attributes.get(.text_direction).?);
    try std.testing.expectEqual(@as(usize, 2), report.sub_lists[0].direct_paragraphs);
    try std.testing.expect(std.mem.indexOf(u8, report.paragraphs[0].raw_xml, "id='1'") != null);
    try std.testing.expect(std.mem.indexOf(u8, report.paragraphs[1].raw_xml, "id='2'") != null);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs[2].sub_list_index);
}

test "HWPX note bodies preserve missing duplicate foreign and unexpected children" {
    var report = try inspect(std.testing.allocator, "<x:footNote/><x:wrap><p:footNote><x:subList/><p:future/><p:subList><x:p/><p:p/></p:subList><p:subList/></p:footNote></x:wrap><p:endNote/><p:footNote><p:wrapper><p:subList/></p:wrapper></p:footNote>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 3), report.notes.len);
    try std.testing.expectEqualStrings("urn:foreign", report.notes[0].parent_uri);
    try std.testing.expectEqual(@as(usize, 2), report.sub_lists.len);
    try std.testing.expectEqual(@as(usize, 2), report.missing_sub_lists);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_sub_lists);
    try std.testing.expectEqual(@as(usize, 3), report.other_note_children);
    try std.testing.expectEqual(@as(usize, 1), report.other_sub_list_children);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs.len);
    try std.testing.expect(report.notes[1].attributes.get(.number) == null);
}

test "HWPX note bodies reject invalid official numeric fields and preserve code units" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "<p:footNote number='65536'/>", "<p:endNote suffixChar='65536'/>", "<p:footNote flag='4294967296'/>", "<p:endNote instId='-1'/>", "<p:footNote number=''/>" }) |source| {
        if (inspect(a, source, .{})) |value| {
            var unexpected = value;
            unexpected.deinit();
            return error.ExpectedInvalidNoteField;
        } else |err| try std.testing.expect(err == error.InvalidUnsigned16 or err == error.InvalidUnsigned32 or err == error.InvalidNonNegativeInteger);
    }
    var report = try inspect(a, "<p:footNote number='-0' userChar='55296' suffixChar='65535'/>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(?u16, 0), report.notes[0].attributes.number);
    try std.testing.expectEqual(@as(?u16, 55296), report.notes[0].attributes.user_char);
    try std.testing.expectEqual(@as(?u16, 65535), report.notes[0].attributes.suffix_char);
}

test "HWPX note bodies use unqualified attributes and preserve XML references" {
    var report = try inspect(std.testing.allocator, "<p:footNote p:number='7' number='&#x31;' x:future='a'><p:subList p:textWidth='4' textWidth='&#x32;'/></p:footNote><p:endNote p:number='8'/>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(?u16, 1), report.notes[0].attributes.number);
    try std.testing.expectEqualStrings("1", report.notes[0].attributes.get(.number).?);
    try std.testing.expectEqual(@as(usize, 2), report.notes[0].attributes.other_attributes);
    try std.testing.expectEqualStrings("2", report.sub_lists[0].attributes.get(.text_width).?);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists[0].attributes.other_attributes);
    try std.testing.expect(report.notes[1].attributes.get(.number) == null);
    try std.testing.expect(std.mem.indexOf(u8, report.notes[0].raw_xml, "&#x31;") != null);
}

test "HWPX note bodies validate ParaListType through its SSOT" {
    try std.testing.expectError(error.InvalidUnsigned32, inspect(std.testing.allocator, "<p:footNote><p:subList textWidth='4294967296'/></p:footNote>", .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(std.testing.allocator, "<p:footNote><p:subList hasNumRef='yes'/></p:footNote>", .{}));
    var report = try inspect(std.testing.allocator, "<p:footNote><p:subList textDirection='FUTURE' id=''/></p:footNote>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.sub_list_unknown_enums);
    try std.testing.expectEqualStrings("", report.sub_lists[0].attributes.get(.id).?);
}

test "HWPX note bodies preserve section order and UTF16 spans" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<p:footNote number='1'><p:subList><p:p/></p:subList></p:footNote>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:endNote number='2'><p:subList><p:p/></p:subList></p:endNote>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    var ordered = try notes.inspect(a, &.{ first, second }, .{});
    defer ordered.deinit();
    try std.testing.expectEqual(@as(usize, 0), ordered.notes[0].section_ordinal);
    try std.testing.expectEqual(@as(usize, 1), ordered.notes[1].section_ordinal);
    try std.testing.expectEqual(@as(usize, 1), ordered.paragraphs[1].section_ordinal);

    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:footNote number='1'><p:subList textDirection='HORIZONTAL'><p:p/></p:subList></p:footNote></p:run></p:p></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var tree = try section_tree.parse(a, raw, 0, 0, .{});
        defer tree.deinit(a);
        var report = try notes.inspect(a, &.{tree}, .{});
        defer report.deinit();
        try std.testing.expectEqualStrings("run", report.notes[0].parent_local_name);
        try std.testing.expectEqualStrings("HORIZONTAL", report.sub_lists[0].attributes.get(.text_direction).?);
        try std.testing.expectEqual(@as(usize, 1), report.paragraphs.len);
        try std.testing.expectEqual(@as(usize, 12), report.paragraphs[0].raw_xml.len);
    }
}

test "HWPX note bodies enforce exact count and byte budgets" {
    const a = std.testing.allocator;
    const source = "<p:footNote number='1'><p:subList textWidth='2'><p:p id='1'/></p:subList></p:footNote>";
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_notes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_sub_lists = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_paragraphs = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_direct_children = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_name_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_owned_bytes = owned });
    exact.deinit();
}

test "HWPX note bodies free all allocations on success and invalid input" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, "<p:footNote flag='1' number='2'><p:subList textDirection='HORIZONTAL' textWidth='3'><p:p/></p:subList></p:footNote>", .{});
            report.deinit();
        }
    }.run, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.InvalidUnsigned16, inspect(checked.allocator(), "<p:footNote number='65536'><p:subList/></p:footNote>", .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(checked.allocator(), "<p:footNote><p:subList hasTextRef='bad'/></p:footNote>", .{}));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX note bodies survive package release and known integration" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:ctrl><p:footNote number='1' suffixChar='41'><p:subList textDirection='HORIZONTAL'><p:p id='0'/></p:subList></p:footNote></p:ctrl>" ++ suffix;
    const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList/></h:head>" },
        .{ .name = "Contents/section0.xml", .data = section },
    };
    const bytes = try fixture.storedZip(a, &sources);
    var doc = try package.inspectDocument(a, bytes, .{});
    var trees = try doc.readXmlTrees(a, .{});
    var from_trees = try trees.inspectNoteBodies(a, .{});
    trees.deinit(a);
    var direct = try doc.inspectNoteBodies(a, .{});
    var known = try doc.inspectKnown(a, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, doc.inspectKnown(checked.allocator(), .{ .note_bodies = .{ .max_notes = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    doc.deinit(a);
    a.free(bytes);
    defer from_trees.deinit();
    defer direct.deinit();
    defer known.deinit(a);
    try std.testing.expectEqualStrings("1", from_trees.notes[0].attributes.get(.number).?);
    try std.testing.expectEqualStrings("HORIZONTAL", direct.sub_lists[0].attributes.get(.text_direction).?);
    try std.testing.expectEqualStrings("<p:p id='0'/>", known.note_bodies.paragraphs[0].raw_xml);
}
