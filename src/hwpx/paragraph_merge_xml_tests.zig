const std = @import("std");

test "HWPX merge XML actual charshape preserves all paragraph text outside merged boundary" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const options = @import("editor_session.zig").siteOptions(.{});
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &counters);
    defer current.deinit(a);
    var exercised: usize = 0;
    for (0..current.paragraphs.len - 1) |index| {
        const left = &current.paragraphs[index];
        const right = &current.paragraphs[index + 1];
        const merged = @import("paragraph_merge_xml.zig").write(a, &section.tree, left, right, options, 4_000_000) catch |err| switch (err) {
            error.UnsupportedParagraphControl, error.UnsupportedInlineControl, error.UnsupportedParagraphTracking, error.UnsupportedMergeMetadata, error.MissingTextSite => continue,
            else => return err,
        };
        defer a.free(merged);
        // Preserve source material between paragraphs instead of swallowing it.
        const l = section.tree.elements[left.template_element];
        const r = section.tree.elements[right.template_element];
        const xml = try @import("xml_source_writer.zig").write(a, section.tree.source, &.{
            .{ .start = l.start_tag.start, .end = l.end, .text = "", .serialized_xml = merged },
            .{ .start = r.start_tag.start, .end = r.end, .text = "", .serialized_xml = "" },
        }, 4_000_000);
        defer a.free(xml);
        var parsed = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, section.tree.item_index, .{});
        defer parsed.deinit(a);
        var sites = try @import("text_sites.zig").collect(a, &parsed, options);
        defer sites.deinit(a);
        const locations = try @import("text_site_locations.zig").build(a, &parsed, &sites, options);
        defer a.free(locations);
        var report: @import("section_text.zig").Report = .{};
        var reopened = try @import("paragraph_structure_collect.zig").collect(a, &parsed, &sites, locations, options, &report);
        defer reopened.deinit(a);
        try std.testing.expectEqual(current.paragraphs.len - 1, reopened.paragraphs.len);
        for (reopened.paragraphs, 0..) |paragraph, ordinal| {
            var expected: std.ArrayList(u8) = .empty;
            defer expected.deinit(a);
            const old_index = ordinal + @as(usize, if (ordinal > index) 1 else 0);
            for (current.paragraphs[old_index].sites.items) |site| try expected.appendSlice(a, site.text);
            if (ordinal == index) for (right.sites.items) |site| try expected.appendSlice(a, site.text);
            var actual: std.ArrayList(u8) = .empty;
            defer actual.deinit(a);
            for (paragraph.sites.items) |site| try actual.appendSlice(a, site.text);
            try std.testing.expectEqualStrings(expected.items, actual.items);
        }
        try std.testing.expectEqualSlices(u8, input, session.source);
        exercised += 1;
    }
    try std.testing.expect(exercised > 0);
}

test "HWPX merge XML generated continuation does not duplicate section metadata" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='7'><p:secPr/><p:t>AB</p:t></p:run><p:linesegarray/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var left: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = try sites.clone(a) };
    defer left.deinit(a);
    var right = try left.clone(a);
    defer right.deinit(a);
    right.source_ordinal = null;
    right.generated_id = 2;
    const first = try a.dupe(u8, "A");
    a.free(left.sites.items[0].text);
    left.sites.items[0].text = first;
    const second = try a.dupe(u8, "B");
    a.free(right.sites.items[0].text);
    right.sites.items[0].text = second;
    const merged = try @import("paragraph_merge_xml.zig").write(a, &tree, &left, &right, .{}, 10000);
    defer a.free(merged);
    const wrapped = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", merged, "</s:sec>" });
    defer a.free(wrapped);
    var parsed = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer parsed.deinit(a);
    var count: usize = 0;
    for (parsed.elements) |element| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "secPr")) count += 1;
        try std.testing.expect(!element.is(@import("document_xml.zig").paragraph_uri, "linesegarray"));
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    var reopened = try @import("text_sites.zig").collect(a, &parsed, .{});
    defer reopened.deinit(a);
    try std.testing.expectEqualStrings("A", reopened.items[0].text);
    try std.testing.expectEqualStrings("B", reopened.items[1].text);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("xml_part_tree.zig").Tree, l: *const @import("paragraph_structure_values.zig").Paragraph, r: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            const output = try @import("paragraph_merge_xml.zig").write(allocator, original, l, r, .{}, 10000);
            defer allocator.free(output);
        }
    }.run, .{ &tree, &left, &right });
}

test "HWPX merge XML preserves heterogeneous styles namespaces and current text" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='3' xmlns:x='urn:left'><p:run charPrIDRef='7'><p:t>A</p:t></p:run><p:linesegarray/></p:p><p:p id='2' paraPrIDRef='4' xmlns:x='urn:right'><!--right--><p:run charPrIDRef='9' x:opaque='keep'><p:t>B</p:t></p:run><p:linesegarray/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    _ = try @import("paragraph_structure_splice.zig").splice(a, &tree, &values, 1, 0, 1, "편집😀<&", 10000);
    const merged = try @import("paragraph_merge_xml.zig").write(a, &tree, &values.paragraphs[0], &values.paragraphs[1], .{}, 10000);
    defer a.free(merged);
    const wrapped = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", merged, "</s:sec>" });
    defer a.free(wrapped);
    var parsed = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer parsed.deinit(a);
    var reopened = try @import("text_sites.zig").collect(a, &parsed, .{});
    defer reopened.deinit(a);
    try std.testing.expectEqualStrings("A", reopened.items[0].text);
    try std.testing.expectEqualStrings("편집😀<&", reopened.items[1].text);
    const first = parsed.elements[1].first_child.?;
    const second = parsed.elements[first].next_sibling.?;
    try std.testing.expect((try parsed.attributeValue(a, first, "", "charPrIDRef")).?.text.equals("7", false));
    try std.testing.expect((try parsed.attributeValue(a, second, "", "charPrIDRef")).?.text.equals("9", false));
    try std.testing.expect((try parsed.attributeValue(a, second, "urn:right", "opaque")) != null);
    try std.testing.expect(std.mem.indexOf(u8, merged, "<!--right-->") != null);
    try std.testing.expect(std.mem.indexOf(u8, merged, "linesegarray") == null);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_merge_xml.zig").write(a, &tree, &values.paragraphs[0], &values.paragraphs[1], .{}, 1));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_structure_values.zig").Values) !void {
            const output = try @import("paragraph_merge_xml.zig").write(allocator, original, &current.paragraphs[0], &current.paragraphs[1], .{}, 10000);
            defer allocator.free(output);
        }
    }.run, .{ &tree, &values });
}
