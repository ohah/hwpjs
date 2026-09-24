const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const paragraph_uri = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const chart_uri = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart";
const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList>" ++
    "<h:charProperties><h:charPr id='5'/><h:charPr id='7'/></h:charProperties>" ++
    "<h:paraProperties><h:paraPr id='20'/><h:paraPr id='21'/></h:paraProperties>" ++
    "<h:styles><h:style id='7'/></h:styles></h:refList></h:head>";
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='" ++ paragraph_uri ++ "'>" ++
    "<p:secPr masterPageCnt='1'><p:masterPage idRef='masterpage0'/></p:secPr><p:p/></s:sec>";

fn zipFor(a: std.mem.Allocator, master: []const u8) ![]u8 {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = section },
        .{ .name = "Contents/masterpage0.xml", .data = master },
    };
    return fixture.storedZip(a, &sources);
}

const prefix = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "'><p:subList><p:p paraPrIDRef='20' styleIDRef='7'><p:run charPrIDRef='5'>";
const suffix = "</p:run></p:p></p:subList></masterPage>";
const branch = "<p:switch><p:case p:required-namespace='" ++ chart_uri ++ "'><p:p paraPrIDRef='99'><p:run charPrIDRef='7'/></p:p></p:case>" ++
    "<p:default><p:p paraPrIDRef='21'><p:run charPrIDRef='5'/></p:p></p:default></p:switch>";

test "HWPX selected master style references separate raw and selected branches" {
    const a = std.testing.allocator;
    const bytes = try zipFor(a, prefix ++ branch ++ suffix);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const raw = try document.inspectMasterPageStyleReferences(a, .{});
    const fallback = try document.inspectSelectedMasterPageStyleReferences(a, .{}, &.{});
    const case = try document.inspectSelectedMasterPageStyleReferences(a, .{}, &.{chart_uri});
    try std.testing.expectEqual(@as(usize, 3), raw.paragraphs);
    try std.testing.expectEqual(@as(usize, 3), raw.runs);
    try std.testing.expectEqual(@as(usize, 1), raw.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 2), fallback.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), fallback.runs);
    try std.testing.expectEqual(@as(usize, 0), fallback.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 2), fallback.counts(.paragraph_shape).resolved);
    try std.testing.expectEqual(@as(usize, 2), case.paragraphs);
    try std.testing.expectEqual(@as(usize, 1), case.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(?u32, 99), case.counts(.paragraph_shape).first_unresolved_id);
    const fallback_text = try document.inspectMasterPageText(a, .{ .text = .{ .scan = .{ .branch_policy = .{ .mode = .selected } } } }, null);
    const case_text = try document.inspectMasterPageText(a, .{ .text = .{ .scan = .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = &.{chart_uri} } } } }, null);
    try std.testing.expectEqual(fallback_text.text.paragraphs, fallback.paragraphs);
    try std.testing.expectEqual(fallback_text.text.runs, fallback.runs);
    try std.testing.expectEqual(case_text.text.paragraphs, case.paragraphs);
    try std.testing.expectEqual(case_text.text.runs, case.runs);
}

test "HWPX selected master style references isolate inactive invalid fields and budgets" {
    const a = std.testing.allocator;
    const bad = "<p:switch><p:case p:required-namespace='" ++ chart_uri ++ "'><p:p paraPrIDRef='bad'><p:run charPrIDRef='bad'/></p:p></p:case>" ++
        "<p:default><p:p paraPrIDRef='21'><p:run charPrIDRef='7'/></p:p></p:default></p:switch>";
    const bytes = try zipFor(a, prefix ++ bad ++ suffix);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const options: package.MasterPageStyleReferenceOptions = .{ .references = .{ .max_paragraphs = 2, .max_runs = 2 } };
    try std.testing.expectError(error.InvalidResourceReferenceId, document.inspectMasterPageStyleReferences(a, .{}));
    const fallback = try document.inspectSelectedMasterPageStyleReferences(a, options, &.{});
    try std.testing.expectEqual(@as(usize, 2), fallback.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), fallback.runs);
    try std.testing.expectError(error.InvalidResourceReferenceId, document.inspectSelectedMasterPageStyleReferences(a, options, &.{chart_uri}));
    try std.testing.expectError(error.InvalidSupportedNamespace, document.inspectSelectedMasterPageStyleReferences(a, .{}, &.{"urn:bad uri"}));
}

test "HWPX selected master style references honor nested switches and first default" {
    const a = std.testing.allocator;
    const nested = "<p:switch><p:case p:required-namespace='urn:outer'><p:switch>" ++
        "<p:default><p:p paraPrIDRef='21'/></p:default>" ++
        "<p:case p:required-namespace='urn:inner'><p:p paraPrIDRef='99'/></p:case>" ++
        "</p:switch></p:case><p:default><p:p paraPrIDRef='20'/></p:default></p:switch>";
    const bytes = try zipFor(a, prefix ++ nested ++ suffix);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const fallback = try document.inspectSelectedMasterPageStyleReferences(a, .{}, &.{});
    const both = try document.inspectSelectedMasterPageStyleReferences(a, .{}, &.{ "urn:outer", "urn:inner" });
    try std.testing.expectEqual(@as(usize, 2), fallback.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), both.paragraphs);
    try std.testing.expectEqual(@as(usize, 0), both.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 2), both.counts(.paragraph_shape).resolved);
}

test "HWPX selected master style references keep foreign switches and direct subList scope" {
    const a = std.testing.allocator;
    const source = "<masterPage id='masterpage0' xmlns:p='" ++ paragraph_uri ++ "' xmlns:x='urn:foreign'>" ++
        "<p:switch><p:default><p:p paraPrIDRef='99'/></p:default></p:switch>" ++
        "<x:subList><p:p paraPrIDRef='99'/></x:subList>" ++
        "<p:subList><p:p paraPrIDRef='20'><p:run charPrIDRef='5'>" ++
        "<x:switch><p:case><p:p paraPrIDRef='21'/></p:case>" ++
        "<p:default><p:p paraPrIDRef='20'/></p:default></x:switch>" ++
        "</p:run></p:p></p:subList></masterPage>";
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const selected = try document.inspectSelectedMasterPageStyleReferences(a, .{}, &.{});
    try std.testing.expectEqual(@as(usize, 1), selected.sub_lists);
    try std.testing.expectEqual(@as(usize, 3), selected.paragraphs);
    try std.testing.expectEqual(@as(usize, 0), selected.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 3), selected.counts(.paragraph_shape).resolved);
}

test "HWPX selected master style references free allocations on every failure" {
    const bytes = try zipFor(std.testing.allocator, prefix ++ branch ++ suffix);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(a, source, .{});
            defer document.deinit(a);
            const report = try document.inspectSelectedMasterPageStyleReferences(a, .{}, &.{});
            try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
        }
    }.run, .{bytes});
}
