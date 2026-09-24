const std = @import("std");
const topology = @import("run_topology.zig");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn inspectXml(a: std.mem.Allocator, source: []const u8, options: topology.Options) !topology.Report {
    var tree = try section_tree.parse(a, source, 0, 9, .{});
    defer tree.deinit(a);
    return topology.inspectSections(a, &.{tree}, options);
}

test "HWPX run topology observes direct children, late secPr and unknown extensions without rejecting" {
    const source = prefix ++
        "<p:p><p:run><p:t/><p:secPr/><p:secPr/><p:bookmark/><p:switch/>" ++
        "<p:future/><x:other xmlns:x='urn:foreign'/></p:run><p:run><p:secPr/></p:run></p:p>" ++
        "<p:run/><x:run xmlns:x='urn:foreign'/></s:sec>";
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 3), report.runs);
    try std.testing.expectEqual(@as(usize, 1), report.non_direct_runs);
    try std.testing.expectEqual(@as(usize, 8), report.direct_children);
    try std.testing.expectEqual(@as(usize, 4), report.childCount(.model));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.bookmark));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.switch_element));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.other_paragraph));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.foreign));
    try std.testing.expectEqual(@as(usize, 3), report.sec_pr_children);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_sec_pr_runs);
    try std.testing.expectEqual(@as(usize, 1), report.late_sec_pr_runs);
    try std.testing.expectEqual(@as(?topology.Location, .{ .item_index = 9, .run_ordinal = 1 }), report.first_late_sec_pr);
    try std.testing.expectEqual(@as(?topology.Location, .{ .item_index = 9, .run_ordinal = 1 }), report.first_duplicate_sec_pr);
    try std.testing.expectEqual(@as(?topology.Location, .{ .item_index = 9, .run_ordinal = 3 }), report.first_non_direct_run);
    try std.testing.expectEqual(@as(?topology.Location, .{ .item_index = 9, .run_ordinal = 1 }), report.first_unmodeled_child);
}

test "HWPX switch shape preserves branches and required namespace forms" {
    const source = prefix ++ "<p:p><p:run>" ++
        "<p:switch extra='x'><p:case p:required-namespace='http://www.hancom.co.kr/hwpml/2016/ooxmlchart'><p:chart/></p:case><p:default><p:ole/></p:default></p:switch>" ++
        "<p:switch/>" ++
        "<p:switch><p:default extra='x'><p:pic/></p:default>" ++
        "<p:case p:required-namespace='' required-namespace='urn:other' extra='x'><p:ole/></p:case><p:default/></p:switch>" ++
        "</p:run></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqualSlices(u64, &.{ 3, 1, 2, 3, 0, 2, 1, 1, 0, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1 }, &report.switches.counts());
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, source, .{ .max_switches = 2 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, source, .{ .max_attribute_bytes = 10 }));
}

test "HWPX switch shape ignores foreign and nested lookalikes" {
    const source = prefix ++ "<p:p><p:run>" ++
        "<x:switch xmlns:x='urn:other'><x:case/></x:switch>" ++
        "<p:future><p:switch><p:case/></p:switch></p:future>" ++
        "<p:switch><x:case xmlns:x='urn:other'/><p:case required-namespace='urn:unqualified'><x:chart xmlns:x='urn:other'/></p:case><p:default/></p:switch>" ++
        "</p:run></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqualSlices(u64, &.{ 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0 }, &report.switches.counts());
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, xml_source: []const u8) !void {
            const result = try inspectXml(a, xml_source, .{});
            try std.testing.expectEqual(@as(usize, 1), result.switches.switches);
        }
    }.run, .{source});
}

test "HWPX switch shape classifies non-chart namespace without selecting a branch" {
    const source = prefix ++ "<p:p><p:run><p:switch>" ++
        "<p:case p:required-namespace='urn:a&amp;b'><p:ole/></p:case>" ++
        "<p:default><p:chart/></p:default>" ++
        "</p:switch></p:run></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.switches.required_other_ns);
    try std.testing.expectEqual(@as(usize, 1), report.switches.case_other_children);
    try std.testing.expectEqual(@as(usize, 1), report.switches.default_other_children);
    try std.testing.expectEqual(@as(usize, 0), report.switches.required_chart_ns);
}

test "HWPX run topology enforces run budget and exact section tree kind" {
    const source = prefix ++ "<p:p><p:run/><p:run/></p:p>" ++ suffix;
    const exact = try inspectXml(std.testing.allocator, source, .{ .max_runs = 2 });
    try std.testing.expectEqual(@as(usize, 2), exact.runs);
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, source, .{ .max_runs = 1 }));
    var header = try header_tree.parse(std.testing.allocator, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(std.testing.allocator);
    try std.testing.expectError(error.InvalidPartKind, topology.inspectSections(std.testing.allocator, &.{header}, .{}));
    var first = try section_tree.parse(std.testing.allocator, source, 0, 10, .{});
    defer first.deinit(std.testing.allocator);
    var second = try section_tree.parse(std.testing.allocator, prefix ++ "<p:run/>" ++ suffix, 1, 11, .{});
    defer second.deinit(std.testing.allocator);
    const combined = try topology.inspectSections(std.testing.allocator, &.{ first, second }, .{});
    try std.testing.expectEqual(@as(usize, 3), combined.runs);
    try std.testing.expectEqual(@as(?topology.Location, .{ .item_index = 11, .run_ordinal = 1 }), combined.first_non_direct_run);
}

test "HWPX run topology counts a nested table paragraph run but not nested secPr" {
    const source = prefix ++ "<p:p><p:run><p:tbl><p:p><p:run><p:t/><p:ctrl/></p:run></p:p>" ++
        "<p:secPr/></p:tbl></p:run></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 2), report.runs);
    try std.testing.expectEqual(@as(usize, 0), report.non_direct_runs);
    try std.testing.expectEqual(@as(usize, 3), report.direct_children);
    try std.testing.expectEqual(@as(usize, 0), report.sec_pr_children);
    try std.testing.expectEqual(@as(usize, 3), report.childCount(.model));
}

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const master = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
    "<p:run><p:future/></p:run><p:subList><p:p id='0'><p:run><p:bookmark/><p:t/>" ++
    "<p:switch><p:case p:required-namespace='http://www.hancom.co.kr/hwpml/2016/ooxmlchart'/><p:default/></p:switch>" ++
    "</p:run></p:p></p:subList></masterPage>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
    .{ .name = "Contents/section0.xml", .data = prefix ++ "<p:p id='0'><p:run><p:secPr><p:masterPage idRef='masterpage0'/></p:secPr></p:run></p:p>" ++ suffix },
    .{ .name = "Contents/masterpage0.xml", .data = master },
};

test "HWPX run topology selects only direct master-page subLists and joins Known" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectMasterPageRunTopology(a, .{ .topology = .{ .max_part_xml_bytes = master.len, .max_total_xml_bytes = master.len } });
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(@as(usize, 1), report.runs);
    try std.testing.expectEqual(@as(usize, 3), report.direct_children);
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.bookmark));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.model));
    try std.testing.expectEqual(@as(usize, 1), report.childCount(.switch_element));
    try std.testing.expectEqual(@as(usize, 1), report.switches.required_chart_ns);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(report.runs, known.master_page_run_topology.runs);
    try std.testing.expectEqual(report.switches.switches, known.master_page_run_topology.switches.switches);
    try std.testing.expectEqual(@as(usize, 1), known.run_topology.runs);
    try std.testing.expectEqual(@as(usize, 1), known.run_topology.sec_pr_children);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageRunTopology(a, .{ .topology = .{ .scan = .{ .max_runs = 0 } } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageRunTopology(a, .{ .topology = .{ .max_parts = 0 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageRunTopology(a, .{ .topology = .{ .max_part_xml_bytes = master.len - 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageRunTopology(a, .{ .topology = .{ .max_total_xml_bytes = master.len - 1 } }));
}

test "HWPX run topology applies one XML byte budget across master-page parts" {
    const a = std.testing.allocator;
    const extra = "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/></o:manifest>";
    const hpf_two = try std.mem.replaceOwned(u8, a, hpf, "</o:manifest>", extra);
    defer a.free(hpf_two);
    const first = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:subList><p:p id='0'><p:run><p:switch/><p:t/></p:run></p:p></p:subList></masterPage>";
    const second = "<masterPage id='masterpage1' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:subList><p:p id='1'><p:run><p:switch/><p:t/></p:run></p:p></p:subList></masterPage>";
    var changed: [sources.len + 1]fixture.Source = undefined;
    @memcpy(changed[0..sources.len], &sources);
    changed[2].data = hpf_two;
    changed[6].data = first;
    changed[sources.len] = .{ .name = "Contents/masterpage1.xml", .data = second };
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const exact = try document.inspectMasterPageRunTopology(a, .{ .topology = .{ .max_total_xml_bytes = first.len + second.len } });
    try std.testing.expectEqual(@as(usize, 2), exact.parts);
    try std.testing.expectEqual(@as(usize, 2), exact.sub_lists);
    try std.testing.expectEqual(@as(usize, 2), exact.runs);
    try std.testing.expectEqual(@as(usize, 2), exact.switches.switches);
    try std.testing.expectEqual(first.len + second.len, exact.xml_bytes);
    try std.testing.expectEqual(@as(?topology.Location, .{ .item_index = 2, .run_ordinal = 1 }), exact.first_unmodeled_child);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageRunTopology(a, .{ .topology = .{ .scan = .{ .max_switches = 1 } } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageRunTopology(a, .{ .topology = .{ .max_total_xml_bytes = first.len + second.len - 1 } }));
}

test "HWPX run topology preserves errors and releases every allocation failure" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, data: []const u8) !void {
            var document = try package.inspectDocument(a, data, .{});
            defer document.deinit(a);
            const report = try document.inspectMasterPageRunTopology(a, .{});
            try std.testing.expectEqual(@as(usize, 1), report.runs);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    _ = try document.inspectMasterPageRunTopology(checked.allocator(), .{});
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    var failed: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = failed.deinit();
    var failed_document = try package.inspectDocument(failed.allocator(), bytes, .{});
    try std.testing.expectError(error.LimitExceeded, failed_document.inspectMasterPageRunTopology(failed.allocator(), .{ .topology = .{ .max_total_xml_bytes = master.len - 1 } }));
    failed_document.deinit(failed.allocator());
    try std.testing.expectEqual(@as(usize, 0), failed.total_requested_bytes);
}
