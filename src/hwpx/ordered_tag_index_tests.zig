const std = @import("std");
const tree_module = @import("xml_part_tree.zig");

test "paragraph read scope ordered tag index matches random lookup and rejects foreign reordered spans" {
    const a = std.testing.allocator;
    var tree = try tree_module.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p/><p:p><p:run><p:t>A</p:t><p:tbl><p:p/></p:tbl></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var cursor: usize = 0;
    for (tree.elements, 0..) |element, index| {
        const raw = tree.source[element.start_tag.start..element.start_tag.end];
        try std.testing.expectEqual(try tree.startTagIndex(raw), try tree.startTagIndexForward(raw, &cursor));
        try std.testing.expectEqual(index + 1, cursor);
    }
    const first = tree.elements[1].start_tag;
    const raw = tree.source[first.start..first.end];
    const before = cursor;
    try std.testing.expectError(error.SourceBindingMismatch, tree.startTagIndexForward(raw, &cursor));
    try std.testing.expectEqual(before, cursor);
    cursor = 0;
    try std.testing.expectError(error.SourceBindingMismatch, tree.startTagIndexForward(raw[0 .. raw.len - 1], &cursor));
    try std.testing.expectEqual(@as(usize, 0), cursor);
    const foreign = try a.dupe(u8, raw);
    defer a.free(foreign);
    try std.testing.expectError(error.InvalidSourceSpan, tree.startTagIndexForward(foreign, &cursor));
    cursor = tree.elements.len + 1;
    try std.testing.expectError(error.InvalidStartTagCursor, tree.startTagIndexForward(raw, &cursor));
}

test "paragraph read scope ordered selected branch locations preserve original scanner ordinals" {
    const a = std.testing.allocator;
    var tree = try tree_module.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:e='http://www.idpf.org/2007/ops'><p:p/><p:p><p:run><p:switch><p:case e:required-namespace='urn:unsupported'><p:t>SKIP</p:t></p:case><p:default><p:t>KEEP</p:t></p:default></p:switch></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const options: @import("text_sites.zig").Options = .{ .branch_policy = .{ .mode = .selected } };
    var sites = try @import("text_sites.zig").collect(a, &tree, options);
    defer sites.deinit(a);
    var counters: @import("section_text.zig").Report = .{ .paragraphs = 7 };
    const locations = try @import("text_site_locations.zig").buildWithCounters(a, &tree, &sites, options, &counters);
    defer a.free(locations);
    try std.testing.expectEqual(@as(usize, 1), locations.len);
    try std.testing.expectEqual(@as(usize, 9), locations[0].paragraph_ordinal);
    var report: @import("section_text.zig").Report = .{ .paragraphs = 7 };
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, options, &report);
    defer values.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), values.paragraphs.len);
    try std.testing.expectEqual(@as(usize, 8), values.paragraphs[0].source_ordinal.?);
    try std.testing.expectEqualStrings("KEEP", values.paragraphs[1].sites.items[0].text);
}
