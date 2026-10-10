const std = @import("std");

test "HWPX current run XML preserves empty style sites and rejects absent bindings" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "<p:t/>", "<p:t></p:t>" }) |text| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='7'>", text, "</p:run></p:p></s:sec>" });
        defer a.free(xml);
        var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
        defer a.free(locations);
        var report: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
        defer current.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), current.paragraphs[0].sites.items.len);
        try std.testing.expectEqualStrings("", current.paragraphs[0].sites.items[0].text);
        const output = try @import("run_current_xml.zig").write(a, &tree, &current.paragraphs[0], 2, .{}, 10000);
        defer a.free(output);
        try std.testing.expect(std.mem.indexOf(u8, output, "charPrIDRef=\"7\"") != null or std.mem.indexOf(u8, output, "charPrIDRef='7'") != null);
        try std.testing.expect(std.mem.indexOf(u8, output, "p:t") != null);
        // Missing provenance is not equivalent to an intentionally empty site.
        var absent = current.paragraphs[0];
        absent.sites.items = absent.sites.items[0..0];
        try std.testing.expectError(error.MissingTextSite, @import("run_current_xml.zig").write(a, &tree, &absent, 2, .{}, 10000));
        try std.testing.expectEqualStrings(xml, tree.source);
    }
}

test "HWPX metadata-only run XML retains original settings and strips continuations atomically" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='7'><p:secPr/></p:run><p:run><p:t>A</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    for ([_]bool{ false, true }) |continuation| {
        const output = try @import("run_current_xml.zig").writeMode(a, &tree, &values.paragraphs[0], 2, .{}, 10000, continuation);
        defer a.free(output);
        try std.testing.expectEqual(!continuation, std.mem.indexOf(u8, output, "secPr") != null);
        try std.testing.expect(std.mem.indexOf(u8, output, "charPrIDRef") != null);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, mode: bool) !void {
                const bytes = try @import("run_current_xml.zig").writeMode(allocator, source, paragraph, 2, .{}, 10000, mode);
                defer allocator.free(bytes);
            }
        }.run, .{ &tree, &values.paragraphs[0], continuation });
    }
    try std.testing.expectEqualStrings("A", values.paragraphs[0].sites.items[0].text);
}

test "HWPX current run XML materializes empty runs after UTF16 subtree normalization" {
    const a = std.testing.allocator;
    const options: @import("text_sites.zig").Options = .{ .materialize_anchor_boundaries = true };
    for ([_][]const u8{ "<p:run charPrIDRef='7'><p:t>A</p:t></p:run>", "<p:run charPrIDRef='7'/>", "<p:run charPrIDRef='7'><p:t/></p:run>" }) |run| {
        const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'>", run, "</p:p></s:sec>" });
        defer a.free(xml);
        const wire = try std.unicode.utf8ToUtf16LeAlloc(a, xml);
        defer a.free(wire);
        const source = try std.mem.concat(a, u8, &.{ &.{ 0xff, 0xfe }, std.mem.sliceAsBytes(wire) });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedEditEncoding, @import("text_sites.zig").collect(a, &tree, options));
        const closed = try @import("xml_subtree_closure.zig").write(a, &tree, 2, 10000);
        defer a.free(closed);
        const normalized_xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", closed, "</p:p></s:sec>" });
        defer a.free(normalized_xml);
        var normalized = try @import("xml_part_tree.zig").parse(a, normalized_xml, .section, 0, 0, .{});
        defer normalized.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &normalized, options);
        defer sites.deinit(a);
        const positions = try @import("text_site_locations.zig").build(a, &normalized, &sites, options);
        defer a.free(positions);
        var report: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &normalized, &sites, positions, options, &report);
        defer current.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), current.paragraphs[0].sites.items.len);
        const site = &current.paragraphs[0].sites.items[0];
        a.free(site.text);
        site.text = try a.dupe(u8, "UTF16입력😀<&");
        const output = try @import("run_current_xml.zig").write(a, &normalized, &current.paragraphs[0], 2, options, 10000);
        defer a.free(output);
        try std.testing.expect(std.unicode.utf8ValidateSlice(output));
        const wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'>", output, "</s:sec>" });
        defer a.free(wrapper);
        var parsed = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
        defer parsed.deinit(a);
        var reopened = try @import("text_sites.zig").collect(a, &parsed, options);
        defer reopened.deinit(a);
        try std.testing.expectEqualStrings("UTF16입력😀<&", reopened.items[0].text);
        try std.testing.expectEqualSlices(u8, source, tree.source);
    }
}

test "HWPX current run XML retains style namespaces and authoritative text" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' xmlns:x='urn:right'><p:run charPrIDRef='7' x:keep='yes'><p:t>A</p:t></p:run><p:run charPrIDRef='9'><p:t>B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer current.deinit(a);
    _ = try @import("paragraph_structure_splice.zig").splice(a, &tree, &current, 0, 0, 1, "현재😀<&", 10000);
    const output = try @import("run_current_xml.zig").write(a, &tree, &current.paragraphs[0], 2, .{}, 10000);
    defer a.free(output);
    const wrapped = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'>", output, "</s:sec>" });
    defer a.free(wrapped);
    var parsed = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer parsed.deinit(a);
    const style = (try parsed.attributeValue(a, 1, "", "charPrIDRef")).?;
    const value = try style.toUtf8(a, 100);
    defer a.free(value);
    try std.testing.expectEqualStrings("7", value);
    try std.testing.expect((try parsed.attributeValue(a, 1, "urn:right", "keep")) != null);
    var reopened = try @import("text_sites.zig").collect(a, &parsed, .{});
    defer reopened.deinit(a);
    try std.testing.expectEqualStrings("현재😀<&", reopened.items[0].text);
    try std.testing.expectEqualStrings("A", sites.items[0].text);
    try std.testing.expectEqualStrings("B", current.paragraphs[0].sites.items[1].text);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            const serialized = try @import("run_current_xml.zig").write(allocator, source, paragraph, 2, .{}, 10000);
            defer allocator.free(serialized);
            try std.testing.expectEqualStrings("현재😀<&", paragraph.sites.items[0].text);
        }
    }.run, .{ &tree, &current.paragraphs[0] });
    try std.testing.expectError(error.LimitExceeded, @import("run_current_xml.zig").write(a, &tree, &current.paragraphs[0], 2, .{}, 1));
}
