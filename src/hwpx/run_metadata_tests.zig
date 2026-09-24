const std = @import("std");
const run_metadata = @import("run_metadata.zig");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn inspectXml(a: std.mem.Allocator, source: []const u8, options: run_metadata.Options) !run_metadata.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return run_metadata.inspect(a, &.{tree}, options);
}

test "HWPX run metadata preserves primary and legacy track change values" {
    const source = prefix ++
        "<p:p><p:run charTcId='0'/><p:run charTcId='7' paraTcId='7'/>" ++
        "<p:run charTcId='8' paraTcId='9'/><p:run paraTcId='10'/>" ++
        "<p:run/><p:run xmlns:x='urn:foreign' x:charTcId='bad'/>" ++
        "<x:run xmlns:x='urn:foreign' charTcId='bad'/></p:p>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 6), report.runs);
    try std.testing.expectEqual(@as(usize, 3), report.missing_char_tc_id);
    try std.testing.expectEqual(@as(usize, 1), report.zero_char_tc_id);
    try std.testing.expectEqual(@as(usize, 3), report.para_tc_alias_present);
    try std.testing.expectEqual(@as(usize, 1), report.para_tc_alias_only);
    try std.testing.expectEqual(@as(usize, 1), report.equal_dual_ids);
    try std.testing.expectEqual(@as(usize, 1), report.conflicting_dual_ids);
}

test "HWPX run metadata rejects malformed ids and enforces exact budgets" {
    for ([_][]const u8{
        "<p:run charTcId='-1'/>",
        "<p:run paraTcId='bad'/>",
        "<p:run charTcId='4294967296'/>",
    }) |run| {
        const source = try std.fmt.allocPrint(std.testing.allocator, "{s}<p:p>{s}</p:p>{s}", .{ prefix, run, suffix });
        defer std.testing.allocator.free(source);
        try std.testing.expectError(if (std.mem.indexOf(u8, run, "4294967296") != null) error.InvalidUnsigned32 else error.InvalidNonNegativeInteger, inspectXml(std.testing.allocator, source, .{}));
    }
    const source = prefix ++ "<p:p><p:run charTcId='1'/><p:run charTcId='2'/></p:p>" ++ suffix;
    const exact = try inspectXml(std.testing.allocator, source, .{ .max_runs = 2 });
    try std.testing.expectEqual(@as(usize, 2), exact.runs);
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, source, .{ .max_runs = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, source, .{ .max_attribute_bytes = 0 }));
}

test "HWPX run metadata spans sections and rejects header trees" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:p><p:run charTcId='3'/></p:p>" ++ suffix;
    var first = try section_tree.parse(a, source, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, source, 1, 1, .{});
    defer second.deinit(a);
    const report = try run_metadata.inspect(a, &.{ first, second }, .{});
    try std.testing.expectEqual(@as(usize, 2), report.sections);
    try std.testing.expectEqual(@as(usize, 2), report.runs);
    try std.testing.expectError(error.LimitExceeded, run_metadata.inspect(a, &.{ first, second }, .{ .max_runs = 1 }));
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, run_metadata.inspect(a, &.{header}, .{}));
}

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
    .{ .name = "Contents/section0.xml", .data = prefix ++ "<p:secPr masterPageCnt='1'><p:masterPage idRef='masterpage0'/></p:secPr><p:p id='0'><p:run charTcId='4'/></p:p>" ++ suffix },
    .{ .name = "Contents/masterpage0.xml", .data = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p id='0'><p:run charTcId='7' paraTcId='8'/></p:p></p:subList></masterPage>" },
};

test "HWPX run metadata applies the same field contract in master pages" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var pages = try document.inspectMasterPages(a, .{});
    defer pages.deinit(a);
    const list = pages.parts.parts[0].sub_lists[0];
    try std.testing.expectEqual(@as(usize, 1), list.run_metadata.runs);
    try std.testing.expectEqual(@as(usize, 1), list.run_metadata.conflicting_dual_ids);
    var known = try document.inspectKnown(a, .{});
    defer known.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), known.run_metadata.runs);
    try std.testing.expectEqual(@as(usize, 1), known.master_pages.parts.parts[0].sub_lists[0].run_metadata.conflicting_dual_ids);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPages(a, .{ .references = .{ .parts = .{ .max_runs_per_part = 0 } } }));
}

test "HWPX run metadata ignores unrelated master-page siblings and rejects scoped damage" {
    const a = std.testing.allocator;
    var changed = sources;
    changed[6].data = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>" ++
        "<p:run charTcId='bad'/><p:subList><p:p id='0'><x:run charTcId='bad'/><p:run charTcId='0'/></p:p></p:subList></masterPage>";
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var pages = try document.inspectMasterPages(a, .{});
    defer pages.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), pages.parts.parts[0].sub_lists[0].run_metadata.runs);
    try std.testing.expectEqual(@as(usize, 1), pages.parts.parts[0].sub_lists[0].run_metadata.zero_char_tc_id);
    changed[6].data = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:subList><p:p id='0'><p:run charTcId='4294967296'/></p:p></p:subList></masterPage>";
    const damaged = try fixture.storedZip(a, &changed);
    defer a.free(damaged);
    var broken = try package.inspectDocument(a, damaged, .{});
    defer broken.deinit(a);
    try std.testing.expectError(error.InvalidUnsigned32, broken.inspectMasterPages(a, .{}));
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var checked_document = try package.inspectDocument(checked.allocator(), damaged, .{});
    try std.testing.expectError(error.InvalidUnsigned32, checked_document.inspectMasterPages(checked.allocator(), .{}));
    checked_document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX run metadata releases allocations on failure" {
    const source = prefix ++ "<p:p><p:run charTcId='5' paraTcId='5'/></p:p>" ++ suffix;
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            _ = try inspectXml(a, bytes, .{});
        }
    }.run, .{source});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(checked.allocator(), prefix ++ "<p:p><p:run charTcId='5' paraTcId='bad'/></p:p>" ++ suffix, .{}));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, data: []const u8) !void {
            var document = try package.inspectDocument(a, data, .{});
            defer document.deinit(a);
            var pages = try document.inspectMasterPages(a, .{});
            defer pages.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), pages.parts.parts[0].sub_lists[0].run_metadata.runs);
        }
    }.run, .{bytes});
    var master_checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = master_checked.deinit();
    var document = try package.inspectDocument(master_checked.allocator(), bytes, .{});
    var pages = try document.inspectMasterPages(master_checked.allocator(), .{});
    pages.deinit(master_checked.allocator());
    document.deinit(master_checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), master_checked.total_requested_bytes);
}
