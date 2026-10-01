//! Paragraph-local field label transaction; field-type permission is upstream.
const std = @import("std");
const ranges = @import("field_text_ranges.zig");
const positions = @import("paragraph_text_positions.zig");
const sites_module = @import("text_sites.zig");

pub fn splice(a: std.mem.Allocator, sites: *sites_module.Sites, segments: []const positions.Segment, field: ranges.Range, section: usize, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize) !bool {
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    const target = try @import("field_text_positions.zig").validateEdit(field, section, segments, start, end);
    return @import("text_splice_transaction.zig").spliceProjected(a, sites, segments, start, deleted, inserted, max_bytes, target);
}

test "HWPX field label splice keeps boundary text inside field and failures atomic" {
    const a = std.testing.allocator;
    const items = try a.alloc(sites_module.Site, 4);
    var owned: usize = 0;
    var transferred = false;
    errdefer if (!transferred) {
        for (items[0..owned]) |site| a.free(site.text);
        a.free(items);
    };
    for ([_][]const u8{ "X", "A😀", "B", "Z" }, items, 0..) |text, *site, index| {
        site.* = .{ .element_index = index, .start = index * 20, .end = index * 20 + 1, .text = try a.dupe(u8, text) };
        owned += 1;
    }
    var sites: sites_module.Sites = .{ .items = items };
    transferred = true;
    defer sites.deinit(a);
    const segments = [_]positions.Segment{
        .{ .kind = .text, .index = 0, .source_start = 0, .start_unit = 0, .end_unit = 1 },
        .{ .kind = .text, .index = 1, .source_start = 20, .start_unit = 1, .end_unit = 4 },
        .{ .kind = .text, .index = 2, .source_start = 40, .start_unit = 4, .end_unit = 5 },
        .{ .kind = .text, .index = 3, .source_start = 60, .start_unit = 5, .end_unit = 6 },
    };
    const field: ranges.Range = .{ .section = 0, .begin_marker = 0, .end_marker = 1, .content_start = 10, .content_end = 50 };
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &sites, &segments, field, 0, 2, 1, "q", 100));
    try std.testing.expectError(error.InvalidTextPosition, splice(a, &sites, &segments, field, 0, 0, 2, "q", 100));
    try std.testing.expectError(error.LimitExceeded, splice(a, &sites, &segments, field, 0, 1, 0, "q", 1));
    try std.testing.expectEqualStrings("A😀", sites.items[1].text);
    try std.testing.expect(try splice(a, &sites, &segments, field, 0, 1, 4, "한", 100));
    try std.testing.expectEqualStrings("X", sites.items[0].text);
    try std.testing.expectEqualStrings("한", sites.items[1].text);
    try std.testing.expectEqualStrings("", sites.items[2].text);
    try std.testing.expectEqualStrings("Z", sites.items[3].text);
}

test "HWPX field label splice releases every failed allocation and preserves current label" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>A😀</p:t></p:run><p:run><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>Z</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const linked = try ranges.build(a, &trees, &report);
    defer a.free(linked);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, field: ranges.Range) !void {
            var sites = try sites_module.collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const locations = try @import("text_site_locations.zig").build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            const segments = try positions.build(allocator, parsed, &sites, locations, 1);
            defer allocator.free(segments);
            _ = splice(allocator, &sites, segments, field, 0, 1, 4, "한😀<&", 10000) catch |err| {
                for (sites.items, [_][]const u8{ "X", "A😀", "B", "Z" }) |site, expected| try std.testing.expectEqualStrings(expected, site.text);
                return err;
            };
            try std.testing.expectEqualStrings("X", sites.items[0].text);
            try std.testing.expectEqualStrings("한😀<&", sites.items[1].text);
            try std.testing.expectEqualStrings("", sites.items[2].text);
            try std.testing.expectEqualStrings("Z", sites.items[3].text);
            const begin_index = find_begin: {
                for (parsed.elements, 0..) |element, index| {
                    if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break :find_begin index;
                }
                return error.MissingFieldTextSite;
            };
            const saved = try @import("text_sites_save.zig").writeWithFieldDirty(allocator, parsed, &sites, .{}, &.{.{ .element_index = begin_index, .dirty = true }}, 10000);
            defer allocator.free(saved);
            try std.testing.expect(std.mem.indexOf(u8, saved, "한😀&lt;&amp;") != null);
            try std.testing.expect(std.mem.indexOf(u8, saved, "dirty=\"1\"") != null);
            try std.testing.expectEqualSlices(u8, source, parsed.source);
        }
    }.run, .{ &tree, linked[0] });
}
