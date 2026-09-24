const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const chart_ns = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart";
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p paraPrIDRef='20' styleIDRef='7'><p:run charPrIDRef='5'>";
const suffix = "</p:run></p:p></s:sec>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList>" ++
    "<h:charProperties><h:charPr id='5'/><h:charPr id='7'/></h:charProperties>" ++
    "<h:paraProperties><h:paraPr id='20'/><h:paraPr id='21'/></h:paraProperties>" ++
    "<h:styles><h:style id='7'/></h:styles></h:refList></h:head>";
const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";

fn zipFor(a: std.mem.Allocator, section: []const u8) ![]u8 {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = section },
    };
    return fixture.storedZip(a, &sources);
}

test "HWPX selected style references retain raw branches and resolve one caption" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:switch>" ++
        "<p:case p:required-namespace='" ++ chart_ns ++ "'><p:chart><p:caption><p:subList><p:p paraPrIDRef='21' styleIDRef='7'><p:run charPrIDRef='7'/></p:p></p:subList></p:caption></p:chart></p:case>" ++
        "<p:default><p:ole><p:caption><p:subList><p:p paraPrIDRef='99' styleIDRef='7'><p:run charPrIDRef='99'/></p:p></p:subList></p:caption></p:ole></p:default>" ++
        "</p:switch>" ++ suffix;
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const raw = try document.inspectReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 3), raw.paragraphs);
    try std.testing.expectEqual(@as(usize, 3), raw.runs);
    try std.testing.expectEqual(@as(usize, 1), raw.counts(.paragraph_shape).missing_target);
    const fallback = try document.inspectSelectedStyleReferences(a, .{}, &.{});
    try std.testing.expectEqual(@as(usize, 2), fallback.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), fallback.runs);
    try std.testing.expectEqual(@as(usize, 1), fallback.counts(.paragraph_shape).missing_target);
    const chart = try document.inspectSelectedStyleReferences(a, .{}, &.{chart_ns});
    try std.testing.expectEqual(@as(usize, 2), chart.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), chart.runs);
    try std.testing.expectEqual(@as(usize, 0), chart.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 2), chart.counts(.paragraph_shape).resolved);
    try std.testing.expectEqual(@as(usize, 2), chart.counts(.character_shape).resolved);
    try std.testing.expectEqual(raw.decoded_xml_bytes, chart.decoded_xml_bytes);
}

test "HWPX selected style references ignore inactive invalid values and budgets" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:switch>" ++
        "<p:case p:required-namespace='" ++ chart_ns ++ "'><p:p paraPrIDRef='no'><p:run charPrIDRef='bad'/></p:p></p:case>" ++
        "<p:default><p:p paraPrIDRef='21' styleIDRef='7'><p:run charPrIDRef='7'/></p:p></p:default>" ++
        "</p:switch>" ++ suffix;
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.InvalidResourceReferenceId, document.inspectReferences(a, .{}));
    const fallback = try document.inspectSelectedStyleReferences(a, .{ .sections = .{ .max_paragraphs = 2, .max_runs = 2 } }, &.{});
    try std.testing.expectEqual(@as(usize, 2), fallback.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), fallback.runs);
    try std.testing.expectEqual(@as(usize, 2), fallback.counts(.paragraph_shape).resolved);
    try std.testing.expectError(error.InvalidResourceReferenceId, document.inspectSelectedStyleReferences(a, .{}, &.{chart_ns}));
    try std.testing.expectError(error.InvalidSupportedNamespace, document.inspectSelectedStyleReferences(a, .{}, &.{"urn:bad uri"}));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, data: []const u8) !void {
            var parsed = try package.inspectDocument(allocator, data, .{});
            defer parsed.deinit(allocator);
            const report = try parsed.inspectSelectedStyleReferences(allocator, .{}, &.{});
            try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
        }
    }.run, .{bytes});
}

test "HWPX selected style references follow nested capability choices" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:switch>" ++
        "<p:case p:required-namespace='urn:outer'><p:switch>" ++
        "<p:case p:required-namespace='urn:inner'><p:p paraPrIDRef='99' styleIDRef='7'><p:run charPrIDRef='99'/></p:p></p:case>" ++
        "<p:default><p:p paraPrIDRef='21' styleIDRef='7'><p:run charPrIDRef='7'/></p:p></p:default>" ++
        "</p:switch></p:case>" ++
        "<p:default><p:p paraPrIDRef='20' styleIDRef='7'><p:run charPrIDRef='5'/></p:p></p:default></p:switch>" ++ suffix;
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const outer_default = try document.inspectSelectedStyleReferences(a, .{}, &.{});
    try std.testing.expectEqual(@as(usize, 2), outer_default.paragraphs);
    try std.testing.expectEqual(@as(usize, 0), outer_default.counts(.paragraph_shape).missing_target);
    const inner_default = try document.inspectSelectedStyleReferences(a, .{}, &.{"urn:outer"});
    try std.testing.expectEqual(@as(usize, 0), inner_default.counts(.paragraph_shape).missing_target);
    const inner_case = try document.inspectSelectedStyleReferences(a, .{}, &.{ "urn:outer", "urn:inner" });
    try std.testing.expectEqual(@as(usize, 1), inner_case.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(?u32, 99), inner_case.counts(.paragraph_shape).first_unresolved_id);
}

test "HWPX selected style references preserve foreign elements and first default" {
    const a = std.testing.allocator;
    const source = prefix ++ "<x:switch xmlns:x='urn:other'><x:case><p:p paraPrIDRef='21' styleIDRef='7'><p:run charPrIDRef='7'/></p:p></x:case></x:switch>" ++
        "<p:switch><p:default><p:p paraPrIDRef='20' styleIDRef='7'><p:run charPrIDRef='5'/></p:p></p:default>" ++
        "<p:case p:required-namespace='" ++ chart_ns ++ "'><p:p paraPrIDRef='bad'/></p:case></p:switch>" ++ suffix;
    const bytes = try zipFor(a, source);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.InvalidResourceReferenceId, document.inspectReferences(a, .{}));
    const selected = try document.inspectSelectedStyleReferences(a, .{}, &.{chart_ns});
    try std.testing.expectEqual(@as(usize, 3), selected.paragraphs);
    try std.testing.expectEqual(@as(usize, 3), selected.runs);
    try std.testing.expectEqual(@as(usize, 3), selected.counts(.paragraph_shape).resolved);
}
