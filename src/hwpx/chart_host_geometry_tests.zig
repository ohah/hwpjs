const std = @import("std");
const host = @import("chart_host_geometry.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:switch><p:case><p:chart>";
const suffix = "</p:chart></p:case><p:default><p:ole><p:sz width='999' height='999'/><p:pos treatAsChar='true'/></p:ole></p:default></p:switch></p:run></p:p></s:sec>";

test "chart host geometry preserves absence zero signed offsets and case ownership under allocation failures" {
    const a = std.testing.allocator;
    const xml = prefix ++ "<x:sz width='777'/><p:curSz width='666'/><p:sz width='0' widthRelTo='ABSOLUTE'/><p:pos treatAsChar='false' vertOffset='-1' horzOffset='4294967295' flowWithText='true' vertRelTo='PARA' horzAlign='LEFT'/>" ++ suffix;
    var tree = try @import("section_tree.zig").parse(a, xml, 0, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree) !void {
            const value = try host.read(allocator, parsed, 3);
            try std.testing.expectEqual(@as(usize, 5), value.chart_node);
            try std.testing.expectEqual(@as(?u32, 0), value.geometry.width);
            try std.testing.expectEqual(@as(?u32, null), value.geometry.height);
            try std.testing.expectEqual(@as(?bool, false), value.geometry.treat_as_character);
            try std.testing.expectEqual(@as(?i64, -1), value.geometry.vertical_offset);
            try std.testing.expectEqual(@as(?i64, 4294967295), value.geometry.horizontal_offset);
            try std.testing.expectEqual(@as(?bool, true), value.position.flags[1]);
            try std.testing.expectEqual(@as(?u32, 2), value.position.relations[0]);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "chart host geometry never falls back to OLE dimensions and rejects ambiguous owners" {
    const a = std.testing.allocator;
    var absent = try @import("section_tree.zig").parse(a, prefix ++ suffix, 0, 0, .{});
    defer absent.deinit(a);
    const value = try host.read(a, &absent, 3);
    try std.testing.expectEqualDeep(@import("picture_geometry_values.zig").Values{}, value.geometry);
    try std.testing.expectEqualDeep(@import("picture_position_values.zig").Values{}, value.position);
    try std.testing.expectError(error.InvalidChartPair, host.read(a, &absent, 5));
    try std.testing.expectError(error.InvalidChartPair, host.read(a, &absent, absent.elements.len));
    inline for (.{
        .{ "<p:sz/><p:sz/>", error.DuplicatePictureGeometryChild },
        .{ "<p:sz width='-1'/>", error.InvalidNonNegativeInteger },
        .{ "<p:sz width='4294967296'/>", error.InvalidUnsigned32 },
        .{ "<p:pos/><p:pos/>", error.DuplicatePictureGeometryChild },
        .{ "<p:pos horzRelTo='UNKNOWN'/>", error.UnsupportedPictureGeometryEnum },
    }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ case[0] ++ suffix, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], host.read(a, &tree, 3));
    }
    var ambiguous = try @import("section_tree.zig").parse(a, prefix ++ "</p:chart></p:case><p:case><p:chart>" ++ suffix, 0, 0, .{});
    defer ambiguous.deinit(a);
    try std.testing.expectError(error.AmbiguousChartPair, host.read(a, &ambiguous, 3));
    var foreign = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:x='urn:foreign'><x:chart/></s:sec>", 0, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectError(error.InvalidChartGeometryNode, @import("picture_geometry_values.zig").readChart(a, &foreign, 1));
    try std.testing.expectError(error.InvalidChartGeometryNode, @import("picture_position_values.zig").readChart(a, &foreign, 1));
}

test "chart host geometry reads actual section dimensions rather than fallback current size" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var archive = try @import("../zip/archive.zig").open(a, bytes, .{});
    defer archive.deinit();
    const xml = try archive.decode(archive.find("Contents/section0.xml").?, 4000000);
    defer archive.allocator.free(xml);
    var tree = try @import("section_tree.zig").parse(a, xml, 0, 0, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "switch")) continue;
        const value = try host.read(a, &tree, node);
        count += 1;
        try std.testing.expectEqual(@as(?u32, 32250), value.geometry.width);
        try std.testing.expectEqual(@as(?u32, 18750), value.geometry.height);
        try std.testing.expectEqual(@as(?u32, 4), value.geometry.width_relative);
        try std.testing.expectEqual(@as(?u32, 2), value.geometry.height_relative);
        try std.testing.expectEqual(@as(?bool, false), value.geometry.treat_as_character);
        try std.testing.expectEqualDeep([4]?u32{ 2, 2, 0, 0 }, value.position.relations);
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expectEqualStrings(xml, tree.source);
}
