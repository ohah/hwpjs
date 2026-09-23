const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:unknown/></h:head>";
const section_one = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><x id='one'/></s:sec>";
const section_zero = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><x id='zero'/></s:sec>";
const hpf = "<p:package xmlns:p='http://www.idpf.org/2007/opf/'><p:manifest>" ++
    "<p:item id='one' href='Contents/section1.xml' media-type='application/xml'/>" ++
    "<p:item id='header' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<p:item id='zero' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<p:item id='extra' href='Contents/other.xml' media-type='application/xml'/>" ++
    "<p:item id='binary' href='BinData/item.bin' media-type='application/octet-stream'/>" ++
    "</p:manifest><p:spine><p:itemref idref='header'/><p:itemref idref='one'/>" ++
    "<p:itemref idref='extra'/><p:itemref idref='binary'/><p:itemref idref='zero'/></p:spine></p:package>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "Contents/header.xml", .data = header },
    .{ .name = "Contents/section1.xml", .data = section_one },
    .{ .name = "Contents/section0.xml", .data = section_zero },
    .{ .name = "Contents/other.xml", .data = "<x:other xmlns:x='urn:extension'/>" },
    .{ .name = "BinData/item.bin", .data = "opaque" },
};

test "HWPX XML trees own selected parts in spine order and retain structure diagnostics" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    var document = try package.inspectDocument(a, bytes, .{});
    var all = try document.readXmlTrees(a, .{});
    document.deinit(a);
    a.free(bytes);
    defer all.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), all.structure.header_item_index);
    try std.testing.expectEqual(@as(usize, 2), all.structure.sections.len);
    try std.testing.expectEqual(@as(usize, 2), all.sections.len);
    try std.testing.expectEqual(@as(usize, 1), all.structure.non_xml_spine_items);
    try std.testing.expectEqual(@as(usize, 1), all.structure.unclassified_spine_xml);
    try std.testing.expectEqual(@as(?bool, false), all.structure.declared_count_matches);
    try std.testing.expectEqual(@as(?bool, false), all.structure.numeric_path_order_matches);
    try std.testing.expect(all.structure.header_in_spine);
    try std.testing.expectEqual(@as(usize, 1), all.header.item_index);
    try std.testing.expectEqual(@as(?usize, null), all.header.section_ordinal);
    try std.testing.expectEqualStrings(header, all.header.source);
    try std.testing.expectEqualStrings(section_one, all.sections[0].source);
    try std.testing.expectEqualStrings(section_zero, all.sections[1].source);
    try std.testing.expectEqual(@as(?usize, 0), all.sections[0].section_ordinal);
    try std.testing.expectEqual(@as(?usize, 1), all.sections[1].section_ordinal);
    try std.testing.expectEqual(@as(usize, 0), all.sections[0].item_index);
    try std.testing.expectEqual(@as(usize, 2), all.sections[1].item_index);
    try std.testing.expectEqual(@as(usize, 2), all.header.elements.len);
    try std.testing.expectEqual(@as(usize, 2), all.sections[0].elements.len);
    try std.testing.expectEqual(@as(usize, 2), all.sections[1].elements.len);
}

test "HWPX XML trees enforce whole-document byte and element budgets before ownership" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const total_bytes = header.len + section_one.len + section_zero.len;
    try std.testing.expectError(error.LimitExceeded, document.readXmlTrees(a, .{ .max_total_owned_xml_bytes = total_bytes - 1 }));
    try std.testing.expectError(error.LimitExceeded, document.readXmlTrees(a, .{ .max_total_elements = 5 }));
    try std.testing.expectError(error.LimitExceeded, document.readXmlTrees(a, .{ .header = .{ .max_xml_bytes = header.len - 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.readXmlTrees(a, .{ .section = .{ .max_nodes = 1 } }));
    var exact = try document.readXmlTrees(a, .{ .max_total_owned_xml_bytes = total_bytes, .max_total_elements = 6 });
    exact.deinit(a);
    var independent = try document.readXmlTrees(a, .{});
    independent.deinit(a);
}

test "HWPX XML trees clean up every allocation failure and ReleaseFast accounting" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, package_bytes: []const u8) !void {
            var document = try package.inspectDocument(allocator, package_bytes, .{});
            defer document.deinit(allocator);
            var all = try document.readXmlTrees(allocator, .{});
            defer all.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), all.sections.len);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    try std.testing.expectError(error.LimitExceeded, document.readXmlTrees(checked.allocator(), .{ .section = .{ .max_nodes = 1 } }));
    var all = try document.readXmlTrees(checked.allocator(), .{});
    all.deinit(checked.allocator());
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX XML trees keep archive and owned-tree allocators separate" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    var archive_alloc: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = archive_alloc.deinit();
    var tree_alloc: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = tree_alloc.deinit();
    var document = try package.inspectDocument(archive_alloc.allocator(), bytes, .{});
    var all = try document.readXmlTrees(tree_alloc.allocator(), .{});
    document.deinit(archive_alloc.allocator());
    try std.testing.expectEqual(@as(usize, 0), archive_alloc.total_requested_bytes);
    try std.testing.expectEqualStrings(section_one, all.sections[0].source);
    all.deinit(tree_alloc.allocator());
    try std.testing.expectEqual(@as(usize, 0), tree_alloc.total_requested_bytes);
}
