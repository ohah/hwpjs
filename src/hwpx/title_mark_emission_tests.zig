//! Synthetic source-only regressions. Native execution requires a separate grant.
const std = @import("std");
const a = std.testing.allocator;
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const values_module = @import("paragraph_structure_values.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";
const Fixture = struct {
    tree: tree_module.Tree,
    sites: sites_module.Sites,
    values: values_module.Values,
    fn init(allocator: std.mem.Allocator, source: []const u8) !Fixture {
        var tree = try tree_module.parse(allocator, source, .section, 0, 0, .{});
        errdefer tree.deinit(allocator);
        var sites = try sites_module.collect(allocator, &tree, .{});
        errdefer sites.deinit(allocator);
        const locations = try @import("text_site_locations.zig").build(allocator, &tree, &sites, .{});
        defer allocator.free(locations);
        var report: @import("section_text.zig").Report = .{};
        var values = try @import("paragraph_structure_collect.zig").collect(allocator, &tree, &sites, locations, .{}, &report);
        errdefer values.deinit(allocator);
        values.paragraphs[0].title_positions = try @import("title_mark_current.zig").read(allocator, &tree, &values.paragraphs[0]);
        return .{ .tree = tree, .sites = sites, .values = values };
    }
    fn deinit(self: *Fixture, allocator: std.mem.Allocator) void {
        self.values.deinit(allocator);
        self.sites.deinit(allocator);
        self.tree.deinit(allocator);
    }
    fn write(self: *Fixture, allocator: std.mem.Allocator) ![]u8 {
        return @import("paragraph_structure_save.zig").write(allocator, &self.tree, &self.values, .{}, &.{}, 10000);
    }
};
fn four(allocator: std.mem.Allocator) !void {
    const source = prefix ++ "<p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>needle😀<p:titleMark ignore='false'/>needle</p:t></p:run></p:p>" ++ suffix;
    var fixture = try Fixture.init(allocator, source);
    defer fixture.deinit(allocator);
    const original = &fixture.values.paragraphs[0];
    var candidate = (try @import("title_mark_text_batch.zig").prepare(allocator, &fixture.tree, original, &.{
        .{ .start = 0, .end = 6, .text = "한", .expected = "needle" },
        .{ .start = 8, .end = 14, .text = "한", .expected = "needle" },
    }, .{ .max_bytes = 1000, .max_spans = 1000 }, null)).?;
    defer candidate.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 4), candidate.title_positions.?[0].unit);
    const xml = try @import("paragraph_split_xml.zig").writeCurrentTitles(allocator, &fixture.tree, &candidate, .{}, 10000);
    defer allocator.free(xml);
    try std.testing.expect(std.mem.indexOf(u8, xml, "한<p:titleMark ignore='false'/>") != null);
    const wrapped = try std.mem.concat(allocator, u8, &.{ prefix, xml, suffix });
    defer allocator.free(wrapped);
    var reopened = try Fixture.init(allocator, wrapped);
    defer reopened.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 4), reopened.values.paragraphs[0].title_positions.?[0].unit);
    try std.testing.expectEqual(@as(usize, 8), original.title_positions.?[0].unit);
    try std.testing.expectEqualStrings(source, fixture.tree.source);
}
test "document text title emission keeps the original four through actual XML and allocation failures" {
    try four(a);
    try @import("../testing/allocation_failures.zig").check(four, .{});
}
fn namespaceMove(allocator: std.mem.Allocator) !void {
    const source = prefix ++ "<p:p><p:run xmlns:x='urn:before'><p:t>A<p:titleMark x:note='keep&amp;raw'/></p:t></p:run><p:run xmlns:x='urn:after'><p:t>B</p:t></p:run></p:p>" ++ suffix;
    var fixture = try Fixture.init(allocator, source);
    defer fixture.deinit(allocator);
    fixture.values.paragraphs[0].title_positions.?[0].unit = 2;
    const xml = try fixture.write(allocator);
    defer allocator.free(xml);
    var reopened = try Fixture.init(allocator, xml);
    defer reopened.deinit(allocator);
    const mark = reopened.values.paragraphs[0].title_positions.?[0];
    try std.testing.expectEqual(@as(usize, 2), mark.unit);
    const attribute = (try @import("xml_part_attributes.zig").find(allocator, &reopened.tree, mark.element_index, "urn:before", "note")).?;
    const text = try attribute.toUtf8(allocator, 1000);
    defer allocator.free(text);
    try std.testing.expectEqualStrings("keep&raw", text);
    try std.testing.expect((try @import("xml_part_attributes.zig").find(allocator, &reopened.tree, mark.element_index, "urn:after", "note")) == null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "x:note='keep&amp;raw'") != null);
    try std.testing.expect((try @import("xml_part_attributes.zig").find(allocator, &reopened.tree, mark.element_index, "", "ignore")) == null);
    try std.testing.expectEqualStrings(source, fixture.tree.source);
}
test "document text title emission preserves namespace meaning unknown attributes and absent ignore after cross-run move" {
    try namespaceMove(a);
    try @import("../testing/allocation_failures.zig").check(namespaceMove, .{});
}
test "document text title emission preserves equal-position source order and exact no-op marker bytes" {
    const source = prefix ++ "<p:p><p:run><p:t>A<p:titleMark ignore='true'/>B<p:titleMark ignore='false'/>C</p:t></p:run></p:p>" ++ suffix;
    var fixture = try Fixture.init(a, source);
    defer fixture.deinit(a);
    const paragraph = &fixture.values.paragraphs[0];
    const unchanged = try @import("paragraph_split_xml.zig").writeCurrentTitles(a, &fixture.tree, paragraph, .{}, 10000);
    defer a.free(unchanged);
    try std.testing.expectEqualStrings(fixture.tree.sourceOf(paragraph.template_element), unchanged);
    // The first marker moves to the second marker's unchanged boundary. Both
    // must be emitted in source order instead of putting the moved one last.
    paragraph.title_positions.?[0].unit = 2;
    const xml = try fixture.write(a);
    defer a.free(xml);
    try std.testing.expect(std.mem.indexOf(u8, xml, "AB<p:titleMark ignore='true'/><p:titleMark ignore='false'/>C") != null);
    var reopened = try Fixture.init(a, xml);
    defer reopened.deinit(a);
    for (reopened.values.paragraphs[0].title_positions.?) |mark| try std.testing.expectEqual(@as(usize, 2), mark.unit);
}
test "document text title emission rejects malformed duplicate foreign sparse and split-scalar ownership without publishing" {
    const source = prefix ++ "<p:p><p:run><p:t>A<p:titleMark/>😀B</p:t></p:run></p:p><p:p><p:run><p:t>other<p:titleMark/></p:t></p:run></p:p>" ++ suffix;
    var fixture = try Fixture.init(a, source);
    defer fixture.deinit(a);
    const paragraph = &fixture.values.paragraphs[0];
    const mark = paragraph.title_positions.?[0];
    paragraph.title_positions.?[0].unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, @import("title_mark_emission_plan.zig").prepare(a, &fixture.tree, paragraph, 10000));
    paragraph.title_positions.?[0].unit = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidTextPosition, @import("title_mark_emission_plan.zig").prepare(a, &fixture.tree, paragraph, 10000));
    const foreign = try @import("title_mark_current.zig").read(a, &fixture.tree, &fixture.values.paragraphs[1]);
    defer a.free(foreign);
    paragraph.title_positions.?[0] = foreign[0];
    try std.testing.expectError(error.SourceBindingMismatch, @import("title_mark_emission_plan.zig").prepare(a, &fixture.tree, paragraph, 10000));
    paragraph.title_positions.?[0] = mark;
    var duplicates = [_]@import("title_mark_position.zig").Position{ mark, mark };
    var forged = paragraph.*;
    forged.title_positions = &duplicates;
    try std.testing.expectError(error.SourceBindingMismatch, @import("title_mark_emission_plan.zig").prepare(a, &fixture.tree, &forged, 10000));
    try std.testing.expectEqualStrings(source, fixture.tree.source);
    try std.testing.expectEqual(mark, paragraph.title_positions.?[0]);
}
test "document text title emission keeps unknown marker content outside the retained admission contract" {
    const source = prefix ++ "<p:p><p:run><p:t>A<p:titleMark><x:opaque xmlns:x='urn:opaque'/></p:titleMark>B</p:t></p:run></p:p>" ++ suffix;
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var marker: ?usize = null;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "titleMark")) {
        marker = index;
    };
    try std.testing.expect(!@import("title_mark_axis.zig").retained(&tree, marker.?));
    try std.testing.expectEqualStrings(source, tree.source);
}
test "document text title emission uses actual empty text and virtual run destinations" {
    inline for (.{ "<p:run><p:t/></p:run>", "<p:run></p:run>" }) |tail| {
        const source = prefix ++ "<p:p><p:run><p:t>A<p:titleMark/></p:t></p:run>" ++ tail ++ "</p:p>" ++ suffix;
        var fixture = try Fixture.init(a, source);
        defer fixture.deinit(a);
        const paragraph = &fixture.values.paragraphs[0];
        for (paragraph.sites.items, 0..) |site, index| {
            const replacement = try a.dupe(u8, if (site.empty_element or site.missing_text) "B" else "");
            paragraph.sites.releaseText(a, index);
            paragraph.sites.items[index].text = replacement;
        }
        paragraph.title_positions.?[0].unit = 1;
        const xml = try fixture.write(a);
        defer a.free(xml);
        try std.testing.expect(std.mem.indexOf(u8, xml, "<p:t>B<p:titleMark/></p:t>") != null);
        var reopened = try Fixture.init(a, xml);
        defer reopened.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), reopened.values.paragraphs[0].title_positions.?[0].unit);
        try std.testing.expectEqualStrings(source, fixture.tree.source);
    }
}
test "document text title emission retains generated identity and unrelated paragraph source" {
    const source = prefix ++ "<p:p id='7'><p:run><p:t>A<p:titleMark ignore='false'/>B</p:t></p:run></p:p><p:p id='8'><p:run><p:t>unrelated</p:t></p:run></p:p>" ++ suffix;
    var fixture = try Fixture.init(a, source);
    defer fixture.deinit(a);
    const paragraph = &fixture.values.paragraphs[0];
    paragraph.generated_id = 99;
    paragraph.source_ordinal = null;
    paragraph.title_positions.?[0].unit = 2;
    const xml = try @import("paragraph_split_xml.zig").writeCurrentTitles(a, &fixture.tree, paragraph, .{}, 10000);
    defer a.free(xml);
    const wrapped = try std.mem.concat(a, u8, &.{ prefix, xml, suffix });
    defer a.free(wrapped);
    var reopened = try Fixture.init(a, wrapped);
    defer reopened.deinit(a);
    const id = (try @import("xml_part_attributes.zig").find(a, &reopened.tree, reopened.values.paragraphs[0].template_element, "", "id")).?;
    const text = try id.toUtf8(a, 100);
    defer a.free(text);
    try std.testing.expectEqualStrings("99", text);
    try std.testing.expectEqual(@as(usize, 2), reopened.values.paragraphs[0].title_positions.?[0].unit);
    try std.testing.expectEqualStrings("<p:p id='8'><p:run><p:t>unrelated</p:t></p:run></p:p>", fixture.tree.sourceOf(fixture.values.paragraphs[1].template_element));
    try std.testing.expectEqualStrings(source, fixture.tree.source);
}
