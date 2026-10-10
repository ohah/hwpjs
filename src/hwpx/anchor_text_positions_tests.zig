const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const locations_module = @import("text_site_locations.zig");
const projection = @import("anchor_text_positions.zig");
const positions = @import("paragraph_text_positions.zig");

test "HWPX paragraph positions retain line break only text boundaries" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t><p:lineBreak/></p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{ .materialize_tab_boundaries = true });
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    const segments = try positions.build(a, &tree, &sites, locations, 1);
    defer a.free(segments);
    try std.testing.expectEqual(@as(usize, 3), segments.len);
    try std.testing.expectEqual(.line_break, segments[1].kind);
    try std.testing.expectEqualStrings("\n", positions.segmentText(&sites, segments[1]));
    try std.testing.expectError(error.ProtectedInlineControl, positions.validateRange(segments, 0, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree, current: *const sites_module.Sites, bound: []const @import("section_text.zig").Location) !void {
            const projected = try positions.build(allocator, parsed, current, bound, 1);
            defer allocator.free(projected);
            try std.testing.expectEqual(.line_break, projected[1].kind);
        }
    }.run, .{ &tree, &sites, locations });
    try std.testing.expect(try @import("text_splice_transaction.zig").spliceProjected(a, &sites, segments, 0, 0, "앞😀", 10000, null));
    try std.testing.expectEqualSlices(u8, source, tree.source);
}

test "HWPX line break retention rejects hidden text children and foreign namespace" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:t>";
    const suffix = "</p:t></p:run></p:p></s:sec>";
    inline for (.{ "<p:lineBreak>hidden</p:lineBreak>", "<p:lineBreak><p:tab/></p:lineBreak>", "<x:lineBreak/>" }) |fragment| {
        var tree = try trees.parse(a, prefix ++ fragment ++ suffix, .section, 0, 0, .{});
        defer tree.deinit(a);
        var found = false;
        for (tree.elements, 0..) |element, index| {
            if (element.is("http://www.hancom.co.kr/hwpml/2011/paragraph", "lineBreak") or element.is("urn:foreign", "lineBreak")) {
                found = true;
                try std.testing.expect(!@import("retained_inline_unit.zig").supported(&tree, index));
            }
        }
        try std.testing.expect(found);
    }
}

test "HWPX anchor note prefix exposes insertion boundary before picture" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:endNote><p:subList><p:p><p:run><p:ctrl><p:autoNum num='1' numType='ENDNOTE'><p:autoNumFormat/></p:autoNum></p:ctrl><p:t> </p:t><p:pic/><p:t/></p:run></p:p></p:subList></p:endNote></p:ctrl><p:t/></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{ .materialize_anchor_boundaries = true });
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    const segments = try projection.build(a, &tree, &sites, locations, 2);
    defer a.free(segments);
    try std.testing.expectEqual(.text, segments[0].kind);
    try std.testing.expectEqual(@as(usize, 0), segments[0].start_unit);
    try std.testing.expectEqual(.anchor, segments[1].kind);
    try std.testing.expectEqual(@as(usize, 0), segments[1].start_unit);
    try std.testing.expect(try @import("text_splice_transaction.zig").spliceProjected(a, &sites, segments, 0, 0, "검증", 10000, null));
    try std.testing.expectEqualSlices(u8, source, tree.source);
}

test "HWPX anchor body automatic number remains protected one unit" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:autoNum num='1' numType='ENDNOTE'><p:autoNumFormat/></p:autoNum></p:ctrl><p:t>A</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    const segments = try projection.build(a, &tree, &sites, locations, 1);
    defer a.free(segments);
    try std.testing.expectEqual(@as(usize, 2), segments.len);
    try std.testing.expectEqual(.anchor, segments[0].kind);
    try std.testing.expectEqual(@as(usize, 1), segments[0].end_unit);
    try std.testing.expectError(error.ProtectedInlineControl, positions.validateRange(segments, 0, 1));
}

test "HWPX anchor positions reject text without direct run ownership and survive allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:pic/><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree, current: *const sites_module.Sites, bound: []const @import("section_text.zig").Location) !void {
            const segments = try projection.build(allocator, parsed, current, bound, 1);
            defer allocator.free(segments);
            try std.testing.expectEqual(@as(usize, 3), segments.len);
            try std.testing.expectEqual(.anchor, segments[1].kind);
        }
    }.run, .{ &tree, &sites, locations });
    const invalid = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:pic><p:t>unowned</p:t></p:pic><p:t>A</p:t></p:run></p:p></s:sec>";
    var wrong_tree = try trees.parse(a, invalid, .section, 0, 0, .{});
    defer wrong_tree.deinit(a);
    var wrong_sites = try sites_module.collect(a, &wrong_tree, .{});
    defer wrong_sites.deinit(a);
    const wrong_locations = try locations_module.build(a, &wrong_tree, &wrong_sites, .{});
    defer a.free(wrong_locations);
    try std.testing.expectError(error.SourceBindingMismatch, projection.build(a, &wrong_tree, &wrong_sites, wrong_locations, 1));
}

test "HWPX anchor positions exclude nested text preserve protected boundary and follow edits" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:ctrl><p:footNote><p:subList><p:p><p:run><p:t>nested</p:t></p:run></p:p></p:subList></p:footNote></p:ctrl><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    const segments = try projection.build(a, &tree, &sites, locations, 1);
    defer a.free(segments);
    try std.testing.expectEqual(@as(usize, 3), segments.len);
    try std.testing.expectEqual(.anchor, segments[1].kind);
    try std.testing.expectEqual(@as(usize, 3), segments[1].start_unit);
    try std.testing.expectEqual(@as(usize, 5), segments[2].end_unit);
    try std.testing.expectError(error.ProtectedInlineControl, @import("text_splice_transaction.zig").spliceProjected(a, &sites, segments, 3, 1, "", 10000, null));
    try std.testing.expect(try @import("text_splice_transaction.zig").spliceProjected(a, &sites, segments, 4, 1, "한", 10000, null));
    try std.testing.expectEqualStrings("nested", sites.items[1].text);
    try std.testing.expectEqualStrings("한", sites.items[2].text);
    _ = try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 0, "앞", 10000);
    const changed = try projection.build(a, &tree, &sites, locations, 1);
    defer a.free(changed);
    try std.testing.expectEqual(@as(usize, 4), changed[1].start_unit);
    const nested = try projection.build(a, &tree, &sites, locations, 2);
    defer a.free(nested);
    try std.testing.expectEqual(@as(usize, 1), nested.len);
    try std.testing.expectEqual(@as(usize, 6), nested[0].end_unit);
    try std.testing.expectEqualSlices(u8, source, tree.source);
}

test "HWPX anchor positions actual note references retain two anchors per outer paragraph" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try locations_module.build(a, &tree, &sites, .{});
    defer a.free(locations);
    for ([_]usize{ 1, 4 }) |paragraph| {
        const segments = try projection.build(a, &tree, &sites, locations, paragraph);
        defer a.free(segments);
        var count: usize = 0;
        for (segments) |segment| if (segment.kind == .anchor) {
            try std.testing.expectEqual(@as(usize, 4) + count, segment.start_unit);
            try std.testing.expectError(error.ProtectedInlineControl, positions.validateRange(segments, segment.start_unit, segment.end_unit));
            count += 1;
        };
        try std.testing.expectEqual(@as(usize, 2), count);
    }
}
