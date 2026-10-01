const std = @import("std");
const package = @import("package.zig");
const sites_module = @import("text_sites.zig");
const source_writer = @import("xml_source_writer.zig");
const tree_module = @import("xml_part_tree.zig");

test "HWPX text sites actual charshape edit reopens without changing other XML bytes" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var document = try package.inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expect(sites.items.len > 0);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expectEqual(sites.items.len, locations.len);
    try std.testing.expectEqual(@as(usize, 1), locations[0].paragraph_ordinal);
    for (locations) |location| {
        try std.testing.expectEqual(@as(usize, 0), location.section_ordinal);
        try std.testing.expectEqual(tree.item_index, location.item_index);
        try std.testing.expect(location.paragraph_ordinal >= 1 and location.paragraph_ordinal <= 7);
        try std.testing.expect(location.run_ordinal != 0 and location.text_ordinal != 0);
    }
    const site = sites.items[0];
    const replacement = try std.mem.concat(a, u8, &.{ "검증😀<&\r", site.text });
    defer a.free(replacement);
    const output = try source_writer.write(a, tree.source, &.{.{ .start = site.start, .end = site.end, .text = replacement }}, 2_000_000);
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, tree.source[0..site.start], output[0..site.start]);
    const suffix = tree.source[site.end..];
    try std.testing.expectEqualSlices(u8, suffix, output[output.len - suffix.len ..]);
    var reopened = try tree_module.parse(a, output, .section, 0, tree.item_index, .{});
    defer reopened.deinit(a);
    var changed = try sites_module.collect(a, &reopened, .{});
    defer changed.deinit(a);
    try std.testing.expectEqual(sites.items.len, changed.items.len);
    for (sites.items, changed.items, 0..) |before, after, index| {
        try std.testing.expectEqual(before.element_index, after.element_index);
        try std.testing.expectEqualStrings(if (index == 0) replacement else before.text, after.text);
    }
}

test "HWPX text sites and XML source output release every partial allocation" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A&amp;<![CDATA[B]]>C</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const tree_module.Tree) !void {
            var sites = try sites_module.collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const site = sites.items[1];
            const output = try source_writer.write(allocator, parsed.source, &.{.{ .start = site.start, .end = site.end, .text = "😀]]><&\r" }}, 10000);
            defer allocator.free(output);
        }
    }.run, .{&tree});
}

test "HWPX text sites actual splice saves ZIP and no-op or restored source is exact" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var document = try package.inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const save = @import("text_sites_save.zig");
    const edit = @import("text_site_edit.zig");
    const noop = try save.write(a, &tree, &sites, .{}, 2_000_000);
    defer a.free(noop);
    try std.testing.expectEqualSlices(u8, tree.source, noop);
    try std.testing.expect(try edit.splice(a, &sites, 0, 0, 0, "검증😀<&\r", 2_000_000));
    const xml = try save.write(a, &tree, &sites, .{}, 2_000_000);
    defer a.free(xml);
    var archive = try @import("../zip/archive.zig").open(a, input, .{});
    defer archive.deinit();
    var selected: ?usize = null;
    for (archive.entries, 0..) |entry, index| if (std.mem.eql(u8, entry.name, "Contents/section0.xml")) {
        selected = index;
    };
    const output = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = selected orelse return error.MissingSection, .bytes = xml }}, .{});
    defer a.free(output);
    var reopened = try package.inspectDocument(a, output, .{});
    defer reopened.deinit(a);
    var changed_tree = try reopened.readSectionTree(a, 0, .{});
    defer changed_tree.deinit(a);
    var changed_sites = try sites_module.collect(a, &changed_tree, .{});
    defer changed_sites.deinit(a);
    try std.testing.expectEqualStrings(sites.items[0].text, changed_sites.items[0].text);
    // Two Hangul units, two emoji units, '<', '&', and CR: seven.
    try std.testing.expect(try edit.splice(a, &sites, 0, 0, 7, "", 2_000_000));
    const restored = try save.write(a, &tree, &sites, .{}, 2_000_000);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, tree.source, restored);
    sites.items[0].start += 1;
    try std.testing.expectError(error.InvalidTextSites, save.write(a, &tree, &sites, .{}, 2_000_000));
}

test "HWPX text sites empty elements preserve attributes comments and restored raw source" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:z='http://www.hancom.co.kr/hwpml/2011/paragraph'><z:p><z:run><z:t attr='&amp;' /><z:t><!--keep--></z:t></z:run></z:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), sites.items.len);
    try std.testing.expect(sites.items[0].empty_element);
    try std.testing.expect(!sites.items[1].empty_element);
    const edit = @import("text_site_edit.zig");
    const save = @import("text_sites_save.zig");
    _ = try edit.splice(a, &sites, 0, 0, 0, "😀<&", 1000);
    _ = try edit.splice(a, &sites, 1, 0, 0, "한", 1000);
    const output = try save.write(a, &tree, &sites, .{}, 10000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "<z:t attr='&amp;' >😀&lt;&amp;</z:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "<z:t>한<!--keep--></z:t>") != null);
    var reopened = try tree_module.parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var updated = try sites_module.collect(a, &reopened, .{});
    defer updated.deinit(a);
    try std.testing.expectEqualStrings("😀<&", updated.items[0].text);
    try std.testing.expectEqualStrings("한", updated.items[1].text);
    _ = try edit.splice(a, &sites, 0, 0, 4, "", 1000);
    _ = try edit.splice(a, &sites, 1, 0, 1, "", 1000);
    const restored = try save.write(a, &tree, &sites, .{}, 10000);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, source, restored);
    _ = try edit.splice(a, &sites, 0, 0, 0, "새😀", 1000);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const tree_module.Tree, current: *const sites_module.Sites) !void {
            const bytes = try @import("text_sites_save.zig").write(allocator, parsed, current, .{}, 10000);
            defer allocator.free(bytes);
        }
    }.run, .{ &tree, &sites });
    try std.testing.expectEqualStrings("새😀", sites.items[0].text);
}

test "HWPX text sites selected branch edits preserve inactive XML and reject policy drift" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:switch><p:case p:required-namespace='urn:feature'><p:t>inactive</p:t><p:t/></p:case><p:default><p:t>active</p:t></p:default></p:switch></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const options: sites_module.Options = .{ .branch_policy = .{ .mode = .selected } };
    var sites = try sites_module.collect(a, &tree, options);
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), sites.items.len);
    try std.testing.expectEqualStrings("active", sites.items[0].text);
    _ = try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 0, "한😀", 1000);
    const output = try @import("text_sites_save.zig").write(a, &tree, &sites, options, 10000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>inactive</p:t><p:t/>") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>한😀active</p:t>") != null);
    try std.testing.expectError(error.InvalidTextSites, @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000));
    var supported = try sites_module.collect(a, &tree, .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = &.{"urn:feature"} } });
    defer supported.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), supported.items.len);
    try std.testing.expectEqualStrings("inactive", supported.items[0].text);
    try std.testing.expect(supported.items[1].empty_element);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const tree_module.Tree, selected: sites_module.Options) !void {
            var current = try sites_module.collect(allocator, parsed, selected);
            defer current.deinit(allocator);
            const saved = try @import("text_sites_save.zig").write(allocator, parsed, &current, selected, 10000);
            defer allocator.free(saved);
        }
    }.run, .{ &tree, options });
}

test "HWPX text sites locations do not invent paragraphs inside inline text" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A<p:p><p:run><p:t>inline</p:t></p:run></p:p>B</p:t></p:run><p:subList><p:p><p:run><p:t>nested</p:t></p:run></p:p></p:subList></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), sites.items.len);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.expectEqual(@as(usize, 1), locations[0].paragraph_ordinal);
    try std.testing.expectEqual(@as(usize, 1), locations[1].paragraph_ordinal);
    try std.testing.expectEqual(@as(usize, 2), locations[2].paragraph_ordinal);
    try std.testing.expectEqual(locations[0].text_ordinal, locations[1].text_ordinal);
    try std.testing.expectEqualStrings("nested", sites.items[2].text);
}

test "HWPX text sites locations accumulate section ordinals and failure preserves counters" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t></p:run></p:p></s:sec>";
    var first = try tree_module.parse(a, source, .section, 0, 3, .{});
    defer first.deinit(a);
    var second = try tree_module.parse(a, source, .section, 1, 7, .{});
    defer second.deinit(a);
    var first_sites = try sites_module.collect(a, &first, .{});
    defer first_sites.deinit(a);
    var second_sites = try sites_module.collect(a, &second, .{});
    defer second_sites.deinit(a);
    const locations_module = @import("text_site_locations.zig");
    var counters: @import("section_text.zig").Report = .{};
    const first_locations = try locations_module.buildWithCounters(a, &first, &first_sites, .{}, &counters);
    defer a.free(first_locations);
    const second_locations = try locations_module.buildWithCounters(a, &second, &second_sites, .{}, &counters);
    defer a.free(second_locations);
    try std.testing.expectEqual(@as(usize, 1), first_locations[0].paragraph_ordinal);
    try std.testing.expectEqual(@as(usize, 2), second_locations[0].paragraph_ordinal);
    try std.testing.expectEqual(@as(usize, 2), second_locations[0].run_ordinal);
    try std.testing.expectEqual(@as(usize, 2), second_locations[0].text_ordinal);
    try std.testing.expectEqual(@as(usize, 1), second_locations[0].section_ordinal);
    try std.testing.expectEqual(@as(usize, 7), second_locations[0].item_index);
    const before = counters;
    second_sites.items[0].element_index = second.elements.len;
    try std.testing.expectError(error.InvalidTextSites, locations_module.buildWithCounters(a, &second, &second_sites, .{}, &counters));
    try std.testing.expectEqualDeep(before, counters);
}

test "HWPX text sites create text in empty runs without losing styles or comments" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "<z:run charPrIDRef='7' />", "<z:run charPrIDRef='7'><!--keep--></z:run>" }) |run_xml| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:z='http://www.hancom.co.kr/hwpml/2011/paragraph'><z:p>", run_xml, "</z:p></s:sec>" });
        defer a.free(source);
        var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_module.collect(a, &tree, .{});
        defer sites.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), sites.items.len);
        try std.testing.expect(sites.items[0].missing_text);
        const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectEqual(@as(usize, 1), locations[0].paragraph_ordinal);
        try std.testing.expectEqual(@as(usize, 0), locations[0].text_ordinal);
        _ = try @import("plain_paragraph_edit.zig").splice(a, &tree, &sites, locations, 1, 0, 0, "한😀<&", 10000);
        const output = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
        defer a.free(output);
        try std.testing.expect(std.mem.indexOf(u8, output, "charPrIDRef='7'") != null);
        try std.testing.expect(std.mem.indexOf(u8, output, "<z:t>한😀&lt;&amp;</z:t>") != null);
        if (std.mem.indexOf(u8, source, "<!--keep-->") != null) try std.testing.expect(std.mem.indexOf(u8, output, "<!--keep-->") != null);
        var reopened = try tree_module.parse(a, output, .section, 0, 0, .{});
        defer reopened.deinit(a);
        var updated = try sites_module.collect(a, &reopened, .{});
        defer updated.deinit(a);
        try std.testing.expectEqualStrings("한😀<&", updated.items[0].text);
        try std.testing.expect(!updated.items[0].missing_text);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, parsed: *const tree_module.Tree, current: *const sites_module.Sites) !void {
                const bytes = try @import("text_sites_save.zig").write(allocator, parsed, current, .{}, 10000);
                defer allocator.free(bytes);
            }
        }.run, .{ &tree, &sites });
        try std.testing.expectEqualStrings("한😀<&", sites.items[0].text);
        _ = try @import("plain_paragraph_edit.zig").splice(a, &tree, &sites, locations, 1, 0, 5, "", 10000);
        const restored = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, source, restored);
    }
}

test "HWPX text sites do not treat unowned nonwhitespace run content as empty" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>opaque</p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), sites.items.len);
}
