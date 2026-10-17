const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const subject = @import("title_mark_axis.zig");
const Axis = subject.Axis;
const Mark = subject.Mark;
const build = subject.build;

fn axisCase(a: std.mem.Allocator) !void {
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀<p:titleMark ignore='1'/><p:titleMark ignore='0'/>B</p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, input, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var axis = try build(a, &tree, &sites, locations, 1);
    defer axis.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), axis.display_units);
    try std.testing.expectEqual(@as(usize, 20), axis.source_units);
    try std.testing.expectEqual(@as(usize, 3), try axis.toSource(3, .before));
    try std.testing.expectEqual(@as(usize, 19), try axis.toSource(3, .after));
    try std.testing.expectEqual(@as(usize, 3), try axis.toDisplay(3));
    try std.testing.expectEqual(@as(usize, 3), try axis.toDisplay(11));
    try std.testing.expectEqual(@as(usize, 3), try axis.toDisplay(19));
    try std.testing.expectError(error.ProtectedInlineControl, axis.toDisplay(4));
    try std.testing.expectError(error.ProtectedInlineControl, axis.toDisplay(18));
    try std.testing.expectError(error.InvalidTextPosition, axis.toSource(5, .after));
    try std.testing.expectError(error.InvalidTextPosition, axis.toDisplay(21));
    try std.testing.expectEqual(@as(?bool, true), axis.marks[0].ignore);
    try std.testing.expectEqual(@as(?bool, false), axis.marks[1].ignore);
    try std.testing.expectEqualSlices(u8, input, tree.source);
}
test "HWPX title mark axis retains eight source units and explicit affinity under OOM" {
    try axisCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(axisCase, .{});
}

test "HWPX title mark axis observes eleven actual headings and rebuilds from current text" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/task1771/nested_group_vectors.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    for ([_]usize{ 56, 65, 73, 74, 84, 110, 111, 121, 131, 184, 191 }) |paragraph| {
        var before = try build(a, &tree, &sites, locations, paragraph);
        defer before.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), before.marks.len);
        try std.testing.expectEqual(before.display_units + 8, before.source_units);
        try std.testing.expect(before.marks[0].ignore != null);
        const site = for (locations, 0..) |location, index| {
            if (location.paragraph_ordinal == paragraph) break index;
        } else return error.TestExpectedEqual;
        _ = try @import("text_site_edit.zig").splice(a, &sites, site, 0, 0, "앞😀", 1_000_000);
        var after = try build(a, &tree, &sites, locations, paragraph);
        defer after.deinit(a);
        try std.testing.expectEqual(before.display_units + 3, after.display_units);
        try std.testing.expectEqual(before.marks[0].display_unit + 3, after.marks[0].display_unit);
        try std.testing.expectEqual(before.marks[0].source_unit + 3, after.marks[0].source_unit);
    }
}

test "HWPX title mark axis rejects malformed markers without defaulting absent ignore" {
    const a = std.testing.allocator;
    inline for (.{ "<p:titleMark ignore='TRUE'/>", "<p:titleMark>hidden</p:titleMark>", "<p:titleMark><p:t>hidden</p:t></p:titleMark>", "<x:titleMark xmlns:x='urn:other'/>", "<p:titleMark/>" }) |marker| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A" ++ marker ++ "B</p:t></p:run></p:p></s:sec>";
        var tree = try trees.parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_mod.collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
        defer a.free(locations);
        if (std.mem.eql(u8, marker, "<p:titleMark/>")) {
            var axis = try build(a, &tree, &sites, locations, 1);
            defer axis.deinit(a);
            try std.testing.expectEqual(@as(?bool, null), axis.marks[0].ignore);
        } else try std.testing.expectError(if (std.mem.indexOf(u8, marker, "TRUE") != null) error.InvalidXmlBoolean else error.UnsupportedInlineControl, build(a, &tree, &sites, locations, 1));
    }
    var empty: [0]Mark = .{};
    const forged: Axis = .{ .marks = &empty, .display_units = 1, .source_units = 9 };
    try std.testing.expectError(error.SourceBindingMismatch, forged.toSource(0, .before));
    try std.testing.expectError(error.SourceBindingMismatch, forged.toDisplay(0));
}

test "HWPX title mark only text materializes boundaries and splices atomically under OOM" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t><p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree) !void {
            var sites = try sites_mod.collect(allocator, parsed, .{ .materialize_tab_boundaries = true });
            defer sites.deinit(allocator);
            const locations = try @import("text_site_locations.zig").build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            _ = @import("plain_paragraph_edit.zig").splice(allocator, parsed, &sites, locations, 1, 0, 0, "앞😀", 10000) catch |err| {
                for (sites.items) |site| try std.testing.expectEqualStrings("", site.text);
                return err;
            };
            var axis = try build(allocator, parsed, &sites, locations, 1);
            defer axis.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), axis.marks[0].display_unit);
            const saved = try @import("text_sites_save.zig").write(allocator, parsed, &sites, .{ .materialize_tab_boundaries = true }, 10000);
            defer allocator.free(saved);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:t>앞😀<p:titleMark ignore='1'/></p:t>") != null);
        }
    }.run, .{&tree});
}

test "HWPX title mark eligibility refuses malformed tab and unknown run metadata before edit" {
    const a = std.testing.allocator;
    inline for (.{ "<p:t>A<p:titleMark/><p:tab>hidden</p:tab>B</p:t>", "<p:t>A<p:titleMark/>B</p:t><p:ctrl><p:future/></p:ctrl>" }, .{ error.UnsupportedInlineControl, error.UnsupportedParagraphControl }) |content, expected| {
        const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>" ++ content ++ "</p:run></p:p></s:sec>";
        var tree = try trees.parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_mod.collect(a, &tree, .{ .materialize_tab_boundaries = true });
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectError(expected, @import("plain_paragraph_policy.zig").validateWithTabs(&tree, &sites, locations, 1, true));
        try std.testing.expectEqualSlices(u8, xml, tree.source);
    }
}

test "HWPX title mark supported tab and column metadata preserve raw source and current axes" {
    const a = std.testing.allocator;
    inline for (.{ "<p:t>A<p:titleMark/><p:tab/>B</p:t>", "<p:t>A<p:titleMark/>B</p:t><p:ctrl><p:colPr/></p:ctrl>" }) |content| {
        const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>" ++ content ++ "</p:run></p:p></s:sec>";
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        const options: sites_mod.Options = .{ .materialize_tab_boundaries = true };
        var sites = try sites_mod.collect(a, &tree, options);
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
        defer a.free(locations);
        try @import("plain_paragraph_policy.zig").validateWithTabs(&tree, &sites, locations, 1, true);
        var before = try build(a, &tree, &sites, locations, 1);
        defer before.deinit(a);
        _ = try @import("plain_paragraph_edit.zig").spliceWithTabs(a, &tree, &sites, locations, 1, 0, 0, "앞😀", 10000, true);
        var after = try build(a, &tree, &sites, locations, 1);
        defer after.deinit(a);
        try std.testing.expectEqual(before.display_units + 3, after.display_units);
        try std.testing.expectEqual(before.source_units + 3, after.source_units);
        try std.testing.expectEqual(before.marks.len, after.marks.len);
        const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, options, 10000);
        defer a.free(saved);
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:titleMark/>"));
        if (std.mem.indexOf(u8, content, "<p:tab/>") != null) try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:tab/>"));
        if (std.mem.indexOf(u8, content, "<p:colPr/>") != null) try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:colPr/>"));
    }
}

test "HWPX title mark splices preserve leading middle trailing markers and surrogate refusal" {
    const a = std.testing.allocator;
    const marker = "<p:titleMark ignore='1'/>";
    inline for (.{ marker ++ "A😀B", "A" ++ marker ++ "😀B", "A😀B" ++ marker }) |content| {
        const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>";
        const suffix = "</p:t></p:run></p:p></s:sec>";
        const xml = prefix ++ content ++ suffix;
        var tree = try trees.parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        const options: sites_mod.Options = .{ .materialize_tab_boundaries = true };
        var sites = try sites_mod.collect(a, &tree, options);
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
        defer a.free(locations);
        try std.testing.expectError(error.SplitSurrogatePair, @import("plain_paragraph_edit.zig").splice(a, &tree, &sites, locations, 1, 2, 0, "오류", 10000));
        const unchanged = try @import("text_sites_save.zig").write(a, &tree, &sites, options, 10000);
        defer a.free(unchanged);
        try std.testing.expectEqualStrings(xml, unchanged);
        _ = try @import("plain_paragraph_edit.zig").splice(a, &tree, &sites, locations, 1, 0, 4, "끝😀", 10000);
        const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, options, 10000);
        defer a.free(saved);
        try std.testing.expectEqualStrings(prefix ++ "끝😀" ++ marker ++ suffix, saved);
        var axis = try build(a, &tree, &sites, locations, 1);
        defer axis.deinit(a);
        try std.testing.expectEqual(@as(usize, 3), axis.display_units);
        try std.testing.expectEqual(@as(usize, 11), axis.source_units);
    }
}

test "HWPX title mark mixed numbering settings preserve four hidden source records" {
    try @import("../testing/checked_allocator.zig").run(mixedNumberingCase, .{});
}

fn mixedNumberingCase(a: std.mem.Allocator) !void {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/task1771/nested_group_vectors.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var before = try build(a, &tree, &sites, locations, 55);
    defer before.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), before.marks.len);
    try std.testing.expectEqual(@as(usize, 37), before.source_units);
    try std.testing.expectEqual(@as(usize, 5), before.display_units);
    try std.testing.expectEqual(.number_setting, before.marks[2].kind);
    try std.testing.expectEqual(.number_setting, before.marks[3].kind);
    _ = try @import("plain_paragraph_edit.zig").splice(a, &tree, &sites, locations, 55, 0, 0, "혼합😀", 1_000_000);
    var after = try build(a, &tree, &sites, locations, 55);
    defer after.deinit(a);
    try std.testing.expectEqual(@as(usize, 41), after.source_units);
    try std.testing.expectEqual(@as(usize, 9), after.display_units);
    const output = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 4_000_000);
    defer a.free(output);
    for (before.marks) |mark| try std.testing.expect(std.mem.indexOf(u8, output, tree.sourceOf(mark.element)) != null);
}
