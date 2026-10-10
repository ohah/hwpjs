//! Typed tab provenance for future formatting; never installs editable values.
const std = @import("std");
const display = @import("character_style_display_ranges.zig");
const Segment = @import("paragraph_text_positions.zig").Segment;
pub const Owner = union(enum) { text_site: usize, tab_element: usize };
pub const Span = struct { start_unit: usize, end_unit: usize, site_start_unit: usize, owner: Owner, char_shape_id: ?u32 };

pub fn build(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, segments: []const Segment, limit: usize) ![]Span {
    for (segments) |segment| switch (segment.kind) {
        .text => {},
        .tab, .nb_space, .fw_space, .line_break, .hypen => {
            try @import("paragraph_text_positions.zig").validateInlineUnit(tree, segment);
        },
        .anchor => return error.UnsupportedInlineControl,
    };
    const ranges = try display.build(a, tree, sites, segments, limit);
    defer a.free(ranges);
    const output = try a.alloc(Span, ranges.len);
    for (ranges, segments, output) |range, segment, *span| span.* = .{
        .start_unit = range.start_unit,
        .end_unit = range.end_unit,
        .site_start_unit = range.start_unit,
        .char_shape_id = range.char_shape_id,
        .owner = switch (segment.kind) {
            .text => .{ .text_site = segment.index },
            .tab, .nb_space, .fw_space, .line_break, .hypen => .{ .tab_element = segment.index },
            .anchor => unreachable,
        },
    };
    return output;
}

test "HWPX typed tab style projection preserves separate provenance and allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>A😀<p:tab/>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, s: *const @import("text_sites.zig").Sites, segments: []const Segment) !void {
            const spans = try build(allocator, t, s, segments, 3);
            defer allocator.free(spans);
            const unchanged = try @import("character_style_tab_paint.zig").prepare(allocator, s, spans, 1, 4, 7, &.{ 7, 9 }, 3);
            defer allocator.free(unchanged);
            try std.testing.expectEqualDeep(spans, unchanged);
            const painted = try @import("character_style_tab_paint.zig").prepare(allocator, s, spans, 1, 4, 9, &.{ 7, 9 }, 10);
            defer allocator.free(painted);
            const owned = try @import("character_style_tab_adapter.zig").fromTyped(allocator, t, s, painted);
            defer allocator.free(owned);
            try std.testing.expectEqual(painted[2].owner.tab_element, owned[2].tab_element.?);
            try std.testing.expectEqual(std.math.maxInt(usize), owned[2].site_index);
            const typed_again = try @import("character_style_tab_adapter.zig").toTyped(allocator, owned);
            defer allocator.free(typed_again);
            try std.testing.expectEqualDeep(painted, typed_again);
            const run_owner = t.elements[s.items[0].element_index].parent.?;
            const paragraph: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = t.elements[run_owner].parent.?, .source_ordinal = 1, .sites = s.*, .character_styles = owned };
            const paragraph_xml = try @import("character_style_paragraph_xml.zig").write(allocator, t, &paragraph, 4000);
            defer allocator.free(paragraph_xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, paragraph_xml, "<p:tab/>"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, paragraph_xml, "😀"));
            var edited = try paragraph.clone(allocator);
            defer edited.deinit(allocator);
            try std.testing.expect(try @import("character_style_splice.zig").splice(allocator, t, &edited, 0, 0, "앞😀<&", 10000));
            const inserted_xml = try @import("character_style_paragraph_xml.zig").write(allocator, t, &edited, 10000);
            defer allocator.free(inserted_xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, inserted_xml, "<p:tab/>"));
            try std.testing.expect(std.mem.indexOf(u8, inserted_xml, "앞😀&lt;&amp;") != null);
            var tab_offset: ?usize = null;
            for (edited.character_styles.?) |style| if (style.tab_element != null) {
                tab_offset = style.start_unit;
            };
            try std.testing.expectEqual(@as(?usize, 8), tab_offset);
            try std.testing.expectEqual(@as(usize, 3), spans[1].start_unit);
            try std.testing.expectEqual(@as(usize, 4), spans[1].end_unit);
            try std.testing.expectEqual(segments[1].index, spans[1].owner.tab_element);
            try std.testing.expectEqual(@as(?u32, 7), spans[1].char_shape_id);
            const assembled = try @import("character_style_tab_run.zig").write(allocator, t, s, t.elements[s.items[0].element_index].parent.?, spans, painted, 4000);
            defer allocator.free(assembled);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, assembled, "<p:tab/>"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, assembled, "😀"));
            const fragment = try @import("character_style_tab_fragment.zig").write(allocator, t, s, painted[2], 1000);
            defer allocator.free(fragment);
            try std.testing.expect(std.mem.indexOf(u8, fragment, "charPrIDRef='9'") != null);
            try std.testing.expect(std.mem.indexOf(u8, fragment, "<p:t><p:tab/></p:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, fragment, "A😀") == null);
            const text_fragment = try @import("character_style_tab_fragment.zig").write(allocator, t, s, painted[1], 1000);
            defer allocator.free(text_fragment);
            try std.testing.expect(std.mem.indexOf(u8, text_fragment, "<p:t>😀</p:t>") != null);
            const wrapped = try std.mem.concat(allocator, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", fragment, "</p:p></s:sec>" });
            defer allocator.free(wrapped);
            var reopened = try @import("xml_part_tree.zig").parse(allocator, wrapped, .section, 0, 0, .{});
            defer reopened.deinit(allocator);
            try std.testing.expectEqual(segments[2].index, spans[2].owner.text_site);
            try std.testing.expectEqual(@as(usize, 4), painted.len);
            try std.testing.expectEqual(@as(?u32, 7), painted[0].char_shape_id);
            try std.testing.expectEqual(@as(?u32, 9), painted[2].char_shape_id);
            try std.testing.expectEqual(spans[1].owner.tab_element, painted[2].owner.tab_element);
            try std.testing.expectEqual(@as(?u32, 7), spans[1].char_shape_id);
            try std.testing.expectError(error.SplitSurrogatePair, @import("character_style_tab_paint.zig").prepare(allocator, s, spans, 2, 4, 9, &.{ 7, 9 }, 10));
        }
    };
    try Probe.run(a, &tree, &sites, positions);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &sites, positions });
    const original = try build(a, &tree, &sites, positions, 3);
    defer a.free(original);
    const run_index = tree.elements[sites.items[0].element_index].parent.?;
    try std.testing.expectError(error.InvalidTextSites, @import("character_style_tab_run.zig").write(a, &tree, &sites, run_index, original, original[0..2], 4000));
    try std.testing.expectError(error.SourceBindingMismatch, @import("character_style_tab_run.zig").write(a, &tree, &sites, run_index, original[0..2], original[0..2], 4000));
    try std.testing.expectError(error.InvalidTextSites, @import("character_style_tab_run.zig").write(a, &tree, &sites, run_index, original, &.{ original[0], original[0], original[1], original[2] }, 4000));
    var invalid = positions[1];
    invalid.end_unit += 1;
    try std.testing.expectError(error.InvalidTextSites, build(a, &tree, &sites, &.{invalid}, 3));
    invalid.kind = .anchor;
    try std.testing.expectError(error.UnsupportedInlineControl, build(a, &tree, &sites, &.{invalid}, 3));
}
