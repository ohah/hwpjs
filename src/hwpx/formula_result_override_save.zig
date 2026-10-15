//! Manual result text serialization. Keeps calculation parameters immutable.
//! Session ownership, dependency invalidation and history are separate gates.
const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");

pub fn write(a: std.mem.Allocator, trees: []const tree_mod.Tree, section: usize, sites: *const sites_mod.Sites, begin: usize, display: []const u8, options: sites_mod.Options, max_bytes: usize) ![]u8 {
    if (section >= trees.len or trees[section].section_ordinal != section) return error.InvalidSectionIndex;
    const tree = &trees[section];
    if (!try @import("formula_source_query.zig").isFormula(a, tree, begin)) return error.InvalidFormulaFieldNode;
    var markers = try @import("field_markers.zig").inspect(a, trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, trees, &markers);
    defer a.free(ranges);
    const range = for (ranges) |range| {
        if (range.section == section and markers.markers[range.begin_marker].element_index == begin) break range;
    } else return error.InvalidFormulaFieldNode;
    const frames = try @import("xml_tree_selection.zig").build(a, tree, options.branch_policy, options.max_attribute_bytes);
    defer a.free(frames);
    if (!frames[begin].active or !frames[markers.markers[range.end_marker].element_index].active) return error.InvalidFormulaBranchOwnership;
    var result = try @import("formula_result_sites.zig").prepare(a, tree, sites, range, display);
    defer result.deinit(a);
    const items = try a.dupe(sites_mod.Site, sites.items);
    defer a.free(items);
    for (result.items) |replacement| items[replacement.site_index].text = replacement.text;
    const temporary: sites_mod.Sites = .{ .items = items };
    return @import("text_sites_save.zig").write(a, tree, &temporary, options, max_bytes);
}

fn allocationCase(a: std.mem.Allocator) !void {
    const owner = std.testing.allocator;
    const source = @import("test_formula_fixture.zig").section;
    var tree = try tree_mod.parse(owner, source, .section, 0, 0, .{});
    defer tree.deinit(owner);
    var sites = try sites_mod.collect(owner, &tree, .{});
    defer sites.deinit(owner);
    const begin = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    const output = try write(a, &.{tree}, 0, &sites, begin, "수동😀<&", .{}, source.len + 4096);
    defer a.free(output);
    const original_text = "<p:t>2</p:t>";
    const position = std.mem.lastIndexOf(u8, source, original_text).?;
    const expected = try std.mem.concat(owner, u8, &.{ source[0..position], "<p:t>수동😀&lt;&amp;</p:t>", source[position + original_text.len ..] });
    defer owner.free(expected);
    try std.testing.expectEqualStrings(expected, output);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectEqualStrings("2", sites.items[1].text);
}

test "HWPX manual formula result serialization preserves every non-result byte under OOM" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX manual formula result serialization rejects invalid owners and display boundaries" {
    const a = std.testing.allocator;
    const source = @import("test_formula_fixture.zig").section;
    var tree = try tree_mod.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const begin = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    try std.testing.expectError(error.InvalidSectionIndex, write(a, &.{tree}, 1, &sites, begin, "9", .{}, 8192));
    try std.testing.expectError(error.InvalidFormulaFieldNode, write(a, &.{tree}, 0, &sites, 0, "9", .{}, 8192));
    try std.testing.expectError(error.InvalidFormulaFieldNode, write(a, &.{tree}, 0, &sites, tree.elements.len, "9", .{}, 8192));
    try std.testing.expectError(error.InvalidUtf8, write(a, &.{tree}, 0, &sites, begin, &.{0xff}, .{}, 8192));
    try std.testing.expectError(error.InvalidXmlCharacter, write(a, &.{tree}, 0, &sites, begin, &.{0}, .{}, 8192));
    try std.testing.expectError(error.LimitExceeded, write(a, &.{tree}, 0, &sites, begin, &([_]u8{'x'} ** 4097), .{}, 8192));
    try std.testing.expectError(error.LimitExceeded, write(a, &.{tree}, 0, &sites, begin, "9", .{}, 0));
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectEqualStrings("2", sites.items[1].text);
}

test "HWPX manual formula result serialization actual thirteen fields changes only selected result bytes" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const trees = [_]tree_mod.Tree{section.tree};
    var markers = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &markers);
    defer a.free(ranges);
    var count: usize = 0;
    for (ranges) |range| {
        const begin = markers.markers[range.begin_marker].element_index;
        if (!try @import("formula_source_query.zig").isFormula(a, &section.tree, begin)) continue;
        var selected: ?sites_mod.Site = null;
        for (section.sites.items) |site| {
            if (site.start < range.content_start or site.end > range.content_end) continue;
            try std.testing.expect(selected == null);
            selected = site;
        }
        const site = selected orelse return error.TestExpectedEqual;
        try std.testing.expect(!site.empty_element and !site.missing_text);
        const expected = try std.mem.concat(a, u8, &.{ section.tree.source[0..site.start], "수동😀&lt;&amp;", section.tree.source[site.end..] });
        defer a.free(expected);
        const output = try write(a, &trees, 0, &section.sites, begin, "수동😀<&", @import("editor_session.zig").siteOptions(session.options), section.tree.source.len + 4096);
        defer a.free(output);
        try std.testing.expectEqualSlices(u8, expected, output);
        const untouched = try @import("text_sites_save.zig").write(a, &section.tree, &section.sites, @import("editor_session.zig").siteOptions(session.options), section.tree.source.len + 4096);
        defer a.free(untouched);
        try std.testing.expectEqualSlices(u8, section.tree.source, untouched);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 13), count);
}

test "HWPX manual formula result serialization cannot edit an inactive source branch" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const start = std.mem.indexOf(u8, fixture, "<p:ctrl><p:fieldBegin").?;
    const end_start = std.mem.indexOfPos(u8, fixture, start, "<p:ctrl><p:fieldEnd").?;
    const end = std.mem.indexOfPos(u8, fixture, end_start, "</p:ctrl>").? + "</p:ctrl>".len;
    const source = try std.mem.concat(a, u8, &.{ fixture[0..start], "<p:switch><p:case>", fixture[start..end], "</p:case><p:default><p:t>visible</p:t></p:default></p:switch>", fixture[end..] });
    defer a.free(source);
    var tree = try tree_mod.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const options: sites_mod.Options = .{ .branch_policy = .{ .mode = .selected } };
    var sites = try sites_mod.collect(a, &tree, options);
    defer sites.deinit(a);
    const begin = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    if (write(a, &.{tree}, 0, &sites, begin, "9", options, 8192)) |unexpected| {
        a.free(unexpected);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(error.InvalidFormulaBranchOwnership, err);
    try std.testing.expectEqualStrings(source, tree.source);
}
