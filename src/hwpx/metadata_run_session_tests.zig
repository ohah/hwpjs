const std = @import("std");
test "section settings and bookmark only paragraph accepts source text without losing metadata" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:secPr><p:pagePr landscape='0'/></p:secPr><p:ctrl><p:colPr type='SINGLE' colCount='1'/></p:ctrl><p:ctrl><p:bookmark name='point'/></p:ctrl></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.canEdit(0, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, original: []const u8) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(@import("editor_session.zig").Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            const changed = proxy.splice(0, 1, 0, 0, "본문😀<&") catch |err| {
                try std.testing.expect(proxy.sections[0].structure_values == null);
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| try std.testing.expectEqualSlices(u8, before.text, after.text);
                proxy.allocator = std.testing.allocator;
                const saved = try proxy.save();
                defer std.testing.allocator.free(saved);
                try std.testing.expectEqualSlices(u8, original, saved);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expect(proxy.sections[0].structure_values == null);
        }
    }.run, .{ &session, input });
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "본문😀<&" }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(std.mem.indexOf(u8, reopened.sections[0].tree.source, "<p:run charPrIDRef='0'><p:t>본문😀&lt;&amp;</p:t><p:secPr>") != null);
    for ([_][]const u8{ "<p:secPr><p:pagePr landscape='0'/></p:secPr>", "<p:colPr type='SINGLE' colCount='1'/>", "<p:bookmark name='point'/>" }) |metadata| {
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, metadata));
    }
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
test "metadata styled fragments keep one control and release every failed allocation" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:ctrl><p:pageNum pos='BOTTOM_CENTER'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    _ = try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 0, "A😀B", 1000);
    const Span = @import("character_style_paint.zig").Span;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, current: *const @import("text_sites.zig").Sites) !void {
            const first: Span = .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 1 };
            const second: Span = .{ .start_unit = 1, .end_unit = 4, .site_start_unit = 0, .site_index = 0, .run_element = 2, .char_shape_id = 0 };
            const prefix = try @import("character_style_missing_run.zig").write(allocator, source, current, first, 4000, true);
            defer allocator.free(prefix);
            const suffix = try @import("character_style_missing_run.zig").write(allocator, source, current, second, 4000, false);
            defer allocator.free(suffix);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, prefix, "<p:pageNum pos='BOTTOM_CENTER'/>"));
            try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, suffix, "pageNum"));
            try std.testing.expect(std.mem.indexOf(u8, prefix, "<p:t>A</p:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, suffix, "<p:t>😀B</p:t>") != null);
        }
    }.run, .{ &tree, &sites });
    try std.testing.expectEqualSlices(u8, xml, tree.source);
    try std.testing.expectEqualStrings("A😀B", sites.items[0].text);
}
test "metadata only paragraph styled text retains its page number control" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:ctrl><p:pageNum pos='BOTTOM_CENTER'/></p:ctrl></p:run></p:p></s:sec>";
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='1'><h:charPr id='0' height='1000'/></h:charProperties></h:refList></h:head>";
    const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 0, "굵게😀"));
    try std.testing.expect(try session.setCharacterProperties(0, 1, 0, 2, .{ .bold = true }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, "<p:pageNum pos='BOTTOM_CENTER'/>"));
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, saved, resaved);
}
test "metadata fallback never steals an existing paragraph text site or empty run" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<p:run><p:ctrl><p:pageNum/></p:ctrl></p:run><p:run><p:t>ABC</p:t></p:run>",
        "<p:run><p:ctrl><p:pageNum/></p:ctrl></p:run><p:run/>",
        "<p:run><p:ctrl><p:pageNum/></p:ctrl></p:run><p:run><p:t><p:tab/></p:t></p:run>",
    }) |runs| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", runs, "</p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{ .materialize_tab_boundaries = true });
        defer sites.deinit(a);
        try std.testing.expectEqual(@as(usize, if (std.mem.indexOf(u8, runs, "<p:tab/>") != null) 2 else 1), sites.items.len);
        for (sites.items) |site| {
            const element = tree.elements[site.element_index];
            try std.testing.expect(!@import("retained_run_metadata.zig").runOnly(&tree, site.element_index));
            try std.testing.expect(element.is(@import("document_xml.zig").paragraph_uri, "t") or element.first_child == null);
        }
    }
}
test "metadata fallback does not claim a field or drawing host paragraph" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "<p:pic/>", "<p:ctrl><p:fieldBegin id='8' type='CLICK_HERE'/></p:ctrl>" }) |control| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:pageNum/></p:ctrl></p:run><p:run>", control, "</p:run></p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        try std.testing.expectEqual(@as(usize, 0), sites.items.len);
    }
}
test "metadata only text collection respects allocation failures and site budget" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:pageNum/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.LimitExceeded, @import("text_sites.zig").collect(a, &tree, .{ .max_sites = 0 }));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree) !void {
            var sites = try @import("text_sites.zig").collect(allocator, source, .{});
            defer sites.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), sites.items.len);
            try std.testing.expect(sites.items[0].missing_text);
            try std.testing.expectEqual(@as(usize, 0), sites.items[0].text.len);
            const saved = try @import("text_sites_save.zig").write(allocator, source, &sites, .{}, 10000);
            defer allocator.free(saved);
            try std.testing.expectEqualSlices(u8, source.source, saved);
        }
    }.run, .{&tree});
    try std.testing.expectEqualSlices(u8, xml, tree.source);
}
test "metadata only run text binding rejects fields anchors and unknown content" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<p:ctrl><p:fieldBegin id='8' type='CLICK_HERE'/></p:ctrl>",
        "<p:pic/>",
        "<p:ctrl><p:unknown/></p:ctrl>",
        "<p:ctrl><p:pageNum/></p:ctrl>opaque",
    }) |body| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>", body, "</p:run></p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        try std.testing.expectEqual(@as(usize, 0), sites.items.len);
    }
}
test "metadata only page number run accepts text without replacing control" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:ctrl><p:pageNum pos='BOTTOM_CENTER' formatType='DIGIT' sideChar=''/></p:ctrl></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.canEdit(0, 1));
    try std.testing.expect(try session.splice(0, 1, 0, 0, "본문😀<&"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(try reopened.canEdit(0, 1));
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, saved, resaved);
    try std.testing.expect(try session.splice(0, 1, 0, 6, ""));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
}
