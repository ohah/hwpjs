const std = @import("std");
const subject = @import("text_node.zig");
const section_tree = @import("section_tree.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn inspectXml(a: std.mem.Allocator, source: []const u8, options: subject.Options) !subject.Report {
    var tree = try section_tree.parse(a, source, 0, 9, .{});
    defer tree.deinit(a);
    return subject.inspectSections(a, &.{tree}, options);
}

test "HWPX text node keeps model and XSD-only child names separate" {
    const source = prefix ++ "<p:p><p:run>" ++
        "<p:t charStyleIDRef='0'>a<p:markpenBegin/><p:markpenEnd/><p:titleMark/><p:tab/><p:lineBreak/><p:hypen/><p:nbSpace/><p:fwSpace/>" ++
        "<p:chval/><p:insertBegin/><p:insertEnd/><p:deleteBegin/><p:deleteEnd/><p:unknownch/>b<p:hyphen/><p:future/><x:other xmlns:x='urn:future'/>c</p:t>" ++
        "<p:t charStyleIDRef='4294967296'/><p:t/>" ++
        "</p:run></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 3), report.text_nodes);
    try std.testing.expectEqual(@as(usize, 1), report.missing_char_style_id_ref);
    try std.testing.expectEqual(@as(usize, 1), report.zero_char_style_id_ref);
    try std.testing.expectEqual(@as(usize, 1), report.over_u32_char_style_id_ref);
    try std.testing.expectEqual(@as(usize, 17), report.direct_children);
    try std.testing.expectEqual(@as(usize, 14), report.childCount(.model));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.xsd_hyphen));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.other_paragraph));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.foreign));
    try std.testing.expectEqual(@as(?subject.Location, .{ .item_index = 9, .text_ordinal = 1 }), report.first_unmodeled_child);
    const xsd_only = try inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t><p:hyphen/></p:t></p:run></p:p>" ++ suffix, .{});
    try std.testing.expectEqual(@as(?subject.Location, .{ .item_index = 9, .text_ordinal = 1 }), xsd_only.first_unmodeled_child);
    const max_id = try inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t charStyleIDRef='4294967295'/></p:run></p:p>" ++ suffix, .{});
    try std.testing.expectEqual(@as(usize, 0), max_id.over_u32_char_style_id_ref);
}

test "HWPX inline annotation attributes preserve missing and invalid values" {
    const source = prefix ++ "<p:p><p:run><p:t>" ++
        "<p:markpenBegin color='#FFFFFF'/><p:markpenBegin color='#000000' extra='x'/>" ++
        "<p:markpenBegin color='#ab12ef'/><p:markpenBegin color='ffffff'/>" ++
        "<p:markpenBegin/><p:markpenEnd extra='x'/>" ++
        "<p:titleMark ignore='1'/><p:titleMark ignore='false'/><p:titleMark ignore='TRUE' extra='x'/><p:titleMark/>" ++
        "</p:t></p:run></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 10), report.annotation_markers);
    try std.testing.expectEqualSlices(u64, &.{ 5, 4, 3, 1, 1, 27_988_718, 1, 1, 1 }, &report.markpen.counts());
    try std.testing.expectEqualSlices(u64, &.{ 4, 3, 1, 1, 1, 1 }, &report.title_mark.counts());
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, source, .{ .max_annotation_markers = 9 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, source, .{ .max_attribute_bytes = 6 }));
}

test "HWPX inline annotation attributes count direct paragraph namespace children only" {
    const source = prefix ++ "<p:p><p:run><p:t>" ++
        "<x:markpenBegin xmlns:x='urn:other' color='#FFFFFF'/>" ++
        "<p:future><p:markpenBegin color='#FFFFFF'/><p:titleMark ignore='1'/></p:future>" ++
        "<p:markpenBegin color='#000000' xmlns:x='urn:other' x:color='#FFFFFF'/>" ++
        "<p:markpenEnd/><p:titleMark ignore='0'/>" ++
        "</p:t></p:run></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 3), report.annotation_markers);
    try std.testing.expectEqualSlices(u64, &.{ 1, 1, 1, 0, 1, 0, 1, 1, 0 }, &report.markpen.counts());
    try std.testing.expectEqualSlices(u64, &.{ 1, 1, 0, 1, 0, 0 }, &report.title_mark.counts());
}

test "HWPX text node validates lexical value, limits and per-part location" {
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t charStyleIDRef='-1'/></p:run></p:p>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t charStyleIDRef='1.5'/></p:run></p:p>" ++ suffix, .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t charStyleIDRef='12'/></p:run></p:p>" ++ suffix, .{ .max_attribute_bytes = 1 }));
    const xml_zero = try inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><p:t charStyleIDRef='-000'/></p:run></p:p>" ++ suffix, .{});
    try std.testing.expectEqual(@as(usize, 1), xml_zero.zero_char_style_id_ref);
    const source = prefix ++ "<p:p><p:run><p:t/><p:t/></p:run></p:p>" ++ suffix;
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, source, .{ .max_text_nodes = 1 }));
    const exact = try inspectXml(std.testing.allocator, source, .{ .max_text_nodes = 2 });
    try std.testing.expectEqual(@as(usize, 2), exact.text_nodes);
    var first = try section_tree.parse(std.testing.allocator, source, 0, 10, .{});
    defer first.deinit(std.testing.allocator);
    var second = try section_tree.parse(std.testing.allocator, prefix ++ "<p:t/>" ++ suffix, 1, 11, .{});
    defer second.deinit(std.testing.allocator);
    const combined = try subject.inspectSections(std.testing.allocator, &.{ first, second }, .{});
    try std.testing.expectEqual(@as(usize, 3), combined.text_nodes);
    try std.testing.expectEqual(@as(?subject.Location, .{ .item_index = 11, .text_ordinal = 1 }), combined.first_non_direct_text);
    const foreign = try inspectXml(std.testing.allocator, prefix ++ "<p:p><p:run><x:t xmlns:x='urn:foreign'/><p:t><p:t/></p:t></p:run></p:p>" ++ suffix, .{});
    try std.testing.expectEqual(@as(usize, 2), foreign.text_nodes);
    try std.testing.expectEqual(@as(usize, 1), foreign.non_direct_text_nodes);
    try std.testing.expectEqual(@as(?subject.Location, .{ .item_index = 9, .text_ordinal = 2 }), foreign.first_non_direct_text);
}

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const master = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
    "<p:t><p:future/></p:t><p:subList><p:p id='0'><p:run><p:t charStyleIDRef='7'>a<p:fwSpace/><p:tab width='4000' leader='0' type='1'/>" ++
    "<p:markpenBegin color='#FFFFFF'/><p:titleMark ignore='1'/><p:markpenEnd/>b</p:t></p:run></p:p></p:subList></masterPage>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
    .{ .name = "Contents/section0.xml", .data = prefix ++ "<p:p id='0'><p:run><p:t charStyleIDRef='1'>section</p:t><p:secPr><p:masterPage idRef='masterpage0'/></p:secPr></p:run></p:p>" ++ suffix },
    .{ .name = "Contents/masterpage0.xml", .data = master },
};

test "HWPX text node inspects only selected master-page subLists and Known" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .max_part_xml_bytes = master.len, .max_total_xml_bytes = master.len } });
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(@as(usize, 1), report.text_nodes);
    try std.testing.expectEqual(@as(usize, 5), report.childCount(.model));
    try std.testing.expectEqual(@as(usize, 1), report.tab.tabs);
    try std.testing.expectEqual(@as(u64, 4000), report.tab.width_sum);
    try std.testing.expectEqual(@as(usize, 3), report.annotation_markers);
    try std.testing.expectEqual(@as(usize, 1), report.markpen.begins);
    try std.testing.expectEqual(@as(usize, 1), report.markpen.ends);
    try std.testing.expectEqual(@as(usize, 1), report.title_mark.ignore_true);
    try std.testing.expectEqual(@as(usize, 0), report.missing_char_style_id_ref);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), known.text_nodes.text_nodes);
    try std.testing.expectEqual(report.text_nodes, known.master_page_text_nodes.text_nodes);
    try std.testing.expectEqual(report.tab.tabs, known.master_page_text_nodes.tab.tabs);
    try std.testing.expectEqual(report.annotation_markers, known.master_page_text_nodes.annotation_markers);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .max_parts = 0 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .max_total_xml_bytes = master.len - 1 } }));
}

test "HWPX text node applies one budget and per-part ordinals across master pages" {
    const a = std.testing.allocator;
    const extra = "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/></o:manifest>";
    const hpf_two = try std.mem.replaceOwned(u8, a, hpf, "</o:manifest>", extra);
    defer a.free(hpf_two);
    const first = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:subList><p:p id='0'><p:run><p:t><p:tab type='LEFT'/><p:titleMark ignore='0'/></p:t></p:run></p:p></p:subList></masterPage>";
    const second = "<masterPage id='masterpage1' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:subList><p:p id='1'><p:run><p:t><p:tab type='1'/><p:markpenBegin color='#000000'/><p:future/></p:t></p:run></p:p></p:subList></masterPage>";
    var changed: [sources.len + 1]fixture.Source = undefined;
    @memcpy(changed[0..sources.len], &sources);
    changed[2].data = hpf_two;
    changed[6].data = first;
    changed[sources.len] = .{ .name = "Contents/masterpage1.xml", .data = second };
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const exact = try document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .max_total_xml_bytes = first.len + second.len } });
    try std.testing.expectEqual(@as(usize, 2), exact.parts);
    try std.testing.expectEqual(@as(usize, 2), exact.text_nodes);
    try std.testing.expectEqual(@as(usize, 2), exact.tab.tabs);
    try std.testing.expectEqual(@as(usize, 2), exact.annotation_markers);
    try std.testing.expectEqual(first.len + second.len, exact.xml_bytes);
    try std.testing.expectEqual(@as(?subject.Location, .{ .item_index = 3, .text_ordinal = 1 }), exact.first_unmodeled_child);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .max_parts = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .scan = .{ .max_text_nodes = 1 } } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .scan = .{ .max_tabs = 1 } } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .scan = .{ .max_annotation_markers = 1 } } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageTextNodes(a, .{ .text_nodes = .{ .max_total_xml_bytes = first.len + second.len - 1 } }));
}

test "HWPX text node releases memory on allocation failures" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, data: []const u8) !void {
            var document = try package.inspectDocument(a, data, .{});
            defer document.deinit(a);
            const report = try document.inspectMasterPageTextNodes(a, .{});
            try std.testing.expectEqual(@as(usize, 1), report.text_nodes);
        }
    }.run, .{bytes});
}
