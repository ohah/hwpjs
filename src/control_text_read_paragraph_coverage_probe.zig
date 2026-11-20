//! Registered paragraph coverage regressions in the coherent Native16 root.
const std = @import("std");
const a = std.testing.allocator;
const kernel = @import("hwpx/control_text_read_context.zig");
const Tree = @import("hwpx/xml_part_tree.zig").Tree;
const begin = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const end = "</s:sec>";
const options: @import("hwpx/text_sites.zig").Options = .{ .branch_policy = .{ .mode = .selected } };
const limits: kernel.Limits = .{ .branch_policy = .{ .mode = .selected } };
const Fixture = struct {
    tree: Tree,
    values: @import("hwpx/paragraph_structure_values.zig").Values,
    scanner: @import("hwpx/section_text.zig").Report,
    fn init(xml: []const u8) !Fixture {
        var tree = try @import("hwpx/xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        errdefer tree.deinit(a);
        var sites = try @import("hwpx/text_sites.zig").collect(a, &tree, options);
        defer sites.deinit(a);
        const locations = try @import("hwpx/text_site_locations.zig").build(a, &tree, &sites, options);
        defer a.free(locations);
        var report: @import("hwpx/section_text.zig").Report = .{};
        const values = try @import("hwpx/paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, options, &report);
        return .{ .tree = tree, .values = values, .scanner = report };
    }
    fn deinit(self: *Fixture) void {
        self.values.deinit(a);
        self.tree.deinit(a);
    }
};

test "control paragraph coverage Native unknown direct paragraph child is not a complete observation" {
    for ([_][]const u8{
        begin ++ "<p:p><p:futureControl/><p:run><p:t>A</p:t></p:run></p:p>" ++ end,
        begin ++ "<p:p><p:futureControl/></p:p>" ++ end,
    }, [_][]const u8{ "A", "" }) |xml, plain| {
        var f = try Fixture.init(xml);
        defer f.deinit();
        var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, limits);
        defer context.deinit();
        try std.testing.expectEqualStrings(plain, context.rows[0].plain);
        try std.testing.expectEqual(kernel.Coverage.partial, context.rows[0].coverage);
        try std.testing.expect(context.rows[0].text == null);
        try std.testing.expectEqual(@as(usize, 0), context.rows[0].controls.len);
        try std.testing.expectEqualStrings(xml, f.tree.source);
    }
    for ([_][]const u8{
        begin ++ "<p:p><p:futureControl/><p:run><p:t>DECOY</p:t></p:run></p:p><p:p><p:run><p:t>SAFE</p:t></p:run></p:p>" ++ end,
        begin ++ "<p:p><p:run><p:t>SAFE</p:t></p:run></p:p><p:p><p:futureControl/><p:run><p:t>DECOY</p:t></p:run></p:p>" ++ end,
    }, [_]usize{ 1, 0 }) |xml, safe_index| {
        var f = try Fixture.init(xml);
        defer f.deinit();
        var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, limits);
        defer context.deinit();
        try std.testing.expectEqual(@as(usize, 2), context.rows.len);
        const safe = try context.rowByIndex(safe_index, f.values.paragraphs[safe_index].template_element);
        const decoy = try context.rowByIndex(1 - safe_index, f.values.paragraphs[1 - safe_index].template_element);
        try std.testing.expect(safe.sourceNode != decoy.sourceNode);
        try std.testing.expectEqual(kernel.Coverage.complete, safe.coverage);
        try std.testing.expectEqualStrings("SAFE", safe.text.?);
        try std.testing.expectEqual(kernel.Coverage.partial, decoy.coverage);
        try std.testing.expectEqualStrings("DECOY", decoy.plain);
        try std.testing.expect(decoy.text == null);
    }
    // The unsupported case is inactive under the same Native selection policy
    // used by the real Session. Its paragraph and unknown child cannot leak
    // into the selected default paragraph's owner or coverage.
    const inactive = begin ++ "<p:p><p:run><p:switch><p:case p:required-namespace='urn:unsupported'><p:p><p:futureControl/><p:run><p:t>INACTIVE</p:t></p:run></p:p></p:case><p:default><p:p><p:run><p:t>ACTIVE</p:t></p:run></p:p></p:default></p:switch></p:run></p:p>" ++ end;
    var f = try Fixture.init(inactive);
    defer f.deinit();
    var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, limits);
    defer context.deinit();
    try std.testing.expectEqual(@as(usize, 2), context.rows.len);
    const active = try context.rowByIndex(1, f.values.paragraphs[1].template_element);
    try std.testing.expectEqual(kernel.Coverage.complete, active.coverage);
    try std.testing.expectEqualStrings("ACTIVE", active.text.?);
    for (context.rows) |row| try std.testing.expect(!std.mem.eql(u8, row.plain, "INACTIVE"));
}

test "control paragraph coverage Native direct nonwhite paragraph content cannot disappear behind complete" {
    for ([_][]const u8{
        begin ++ "<p:p>OUT<p:run><p:t>A</p:t></p:run></p:p>" ++ end,
        begin ++ "<p:p>OUT</p:p>" ++ end,
        begin ++ "<p:p>&#65;<p:run><p:t>A</p:t></p:run></p:p>" ++ end,
        begin ++ "<p:p><![CDATA[OUT]]><p:run><p:t>A</p:t></p:run></p:p>" ++ end,
    }, [_][]const u8{ "A", "", "A", "A" }) |xml, plain| {
        var f = try Fixture.init(xml);
        defer f.deinit();
        try std.testing.expectEqual(@as(usize, 1), f.scanner.non_text_content_chunks);
        var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, limits);
        defer context.deinit();
        try std.testing.expectEqualStrings(plain, context.rows[0].plain);
        try std.testing.expectEqual(kernel.Coverage.partial, context.rows[0].coverage);
        try std.testing.expect(context.rows[0].text == null);
        try std.testing.expectEqualStrings(xml, f.tree.source);
    }
}

test "control paragraph coverage Native layout metadata and whitespace preserve valid complete rows" {
    for ([_][]const u8{
        begin ++ "<p:p> \n<p:run><p:t>A</p:t><p:ctrl><p:colPr/></p:ctrl></p:run><p:linesegarray><p:lineseg/></p:linesegarray>\t</p:p>" ++ end,
        begin ++ "<p:p> \n<p:run><p:ctrl><p:colPr/></p:ctrl></p:run><p:linesegarray/>\t</p:p>" ++ end,
        begin ++ "<p:p><!-- retained source comment --><p:run><p:t>A</p:t></p:run></p:p>" ++ end,
        begin ++ "<p:p>&#x20;&#9;&#10;&#13;<p:run><p:t>A</p:t></p:run></p:p>" ++ end,
        begin ++ "<p:p><![CDATA[ \t\n]]><p:run><p:t>A</p:t></p:run></p:p>" ++ end,
    }, [_][]const u8{ "A", "", "A", "A", "A" }) |xml, plain| {
        var f = try Fixture.init(xml);
        defer f.deinit();
        var context = try kernel.Context.init(a, &f.tree, f.values.paragraphs, limits);
        defer context.deinit();
        try std.testing.expectEqualStrings(plain, context.rows[0].plain);
        try std.testing.expectEqual(kernel.Coverage.complete, context.rows[0].coverage);
        try std.testing.expectEqualStrings(plain, context.rows[0].text.?);
        try std.testing.expectEqual(@as(usize, 0), context.rows[0].controls.len);
    }
}
