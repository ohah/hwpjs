//! Atomic current-value topology change; immutable XML remains provenance.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const scanner = @import("section_text.zig");

/// Caller obtains id from paragraph_instance_ids.next across all source parts
/// and current generated IDs. This layer additionally rejects local reuse.
/// Temporary locations are paragraph-local position adapters, not public
/// document scanner ordinals; the immutable template owns run/style binding.
pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize) !model.Values {
    return prepareMode(a, tree, current, index, at, end, id, limit, false);
}

pub fn prepareAnchored(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize) !model.Values {
    return prepareMode(a, tree, current, index, at, end, id, limit, true);
}

fn prepareMode(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize, anchored: bool) !model.Values {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (id == 0) return error.InvalidParagraphId;
    for (current.paragraphs) |paragraph| if (paragraph.generated_id == id) return error.DuplicateParagraphId;
    const original_selected = &current.paragraphs[index];
    if (original_selected.page_area_positions != null) return @import("page_area_structure_split.zig").prepare(a, tree, current, index, at, end, id, limit);
    if (original_selected.field_positions != null) return error.UnsupportedStructuralFieldEdit;
    var selected_value = original_selected.*;
    const selected = &selected_value;
    if (selected.column_boundaries != null and selected.pieces != null and selected.protected_positions != null)
        return @import("column_boundary_joined_tab_split_values.zig").prepare(a, tree, current, index, at, end, id, limit);
    if (selected.column_boundaries != null) return @import("column_boundary_split.zig").prepare(a, tree, current, index, at, end, id, limit, anchored);
    if (selected.pieces != null and selected.protected_positions != null)
        return @import("paragraph_structure_joined_tab_split.zig").prepare(a, tree, current, index, at, end, id, limit);
    if ((!anchored and selected.protected_positions != null) or (anchored and selected.pieces != null)) return error.UnsupportedAnchoredStructure;
    if (selected.pieces != null) return @import("paragraph_structure_joined_split.zig").prepare(a, tree, current, index, at, end, id, limit);
    var continuation_sites: ?@import("text_sites.zig").Sites = null;
    defer if (continuation_sites) |*sites| sites.deinit(a);
    if (selected.generated_id != null and selected.protected_positions == null and selected.character_styles == null) {
        continuation_sites = try @import("continuation_empty_run.zig").clone(a, tree, selected.template_element, &selected.sites);
        selected.sites = continuation_sites.?;
    }
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, selected);
    defer a.free(locations);
    var draft = if (anchored) try @import("paragraph_split_text.zig").prepareCurrentAnchored(a, tree, selected, at, end, limit) else try @import("paragraph_split_text.zig").prepare(a, tree, &selected.sites, locations, 1, at, end, limit);
    defer draft.deinit(a);
    const protected = if (anchored) try @import("paragraph_protected_positions.zig").build(a, tree, selected) else null;
    defer if (protected) |items| a.free(items);
    const titles = try @import("title_mark_current.zig").read(a, tree, selected);
    defer a.free(titles);
    if (draft.paragraph_element != selected.template_element) return error.SourceBindingMismatch;
    const count = std.math.add(usize, current.paragraphs.len, 1) catch return error.LimitExceeded;
    const paragraphs = try a.alloc(model.Paragraph, count);
    var initialized: usize = 0;
    errdefer {
        for (paragraphs[0..initialized]) |*paragraph| paragraph.deinit(a);
        a.free(paragraphs);
    }
    for (current.paragraphs, 0..) |paragraph, old_index| {
        if (old_index == index) {
            paragraphs[initialized] = .{ .template_element = paragraph.template_element, .source_ordinal = paragraph.source_ordinal, .generated_id = paragraph.generated_id, .paragraph_shape_id = paragraph.paragraph_shape_id, .sites = try draft.left.clone(a) };
            initialized += 1;
            paragraphs[initialized - 1].title_positions = try @import("title_mark_position.zig").side(a, titles, at, end, false);
            if (protected) |items| paragraphs[initialized - 1].protected_positions = try @import("paragraph_protected_positions.zig").side(a, items, at, end, false);
            if (paragraph.character_styles) |styles| paragraphs[initialized - 1].character_styles = if (protected) |items| try @import("character_style_protected_split.zig").side(a, styles, &paragraph.sites, &draft.left, items, at, false, 1_000_000) else try @import("character_style_split.zig").side(a, styles, &paragraph.sites, &draft.left, at, false, 1_000_000);
            paragraphs[initialized] = .{ .template_element = paragraph.template_element, .source_ordinal = null, .generated_id = id, .paragraph_shape_id = paragraph.paragraph_shape_id, .sites = try draft.right.clone(a) };
            initialized += 1;
            paragraphs[initialized - 1].title_positions = try @import("title_mark_position.zig").side(a, titles, at, end, true);
            if (protected) |items| paragraphs[initialized - 1].protected_positions = try @import("paragraph_protected_positions.zig").side(a, items, at, end, true);
            if (paragraph.character_styles) |styles| paragraphs[initialized - 1].character_styles = if (protected) |items| try @import("character_style_protected_split.zig").side(a, styles, &paragraph.sites, &draft.right, items, end, true, 1_000_000) else try @import("character_style_split.zig").side(a, styles, &paragraph.sites, &draft.right, end, true, 1_000_000);
        } else {
            paragraphs[initialized] = try paragraph.clone(a);
            initialized += 1;
        }
    }
    if (!anchored) @import("paragraph_page_area_order.zig").afterSplit(tree, paragraphs, index);
    const output: model.Values = .{ .paragraphs = paragraphs };
    _ = try output.byteSize(limit);
    return output;
}

test "HWPX structure split owns repeated generated values and preserves source on failure" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A😀B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: scanner.Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer original.deinit(a);
    original.paragraphs[0].paragraph_shape_id = 0;
    var first = try prepare(a, &tree, &original, 0, 1, 1, 2, 10000);
    defer first.deinit(a);
    var second = try prepare(a, &tree, &first, 1, 2, 2, 3, 10000);
    defer second.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), second.paragraphs.len);
    for (second.paragraphs) |paragraph| try std.testing.expectEqual(@as(?u32, 0), paragraph.paragraph_shape_id);
    try std.testing.expectError(error.MissingParagraphShapeReference, @import("paragraph_structure_save.zig").write(a, &tree, &second, .{}, &.{}, 10000));
    try std.testing.expectEqualStrings("A", second.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("😀", second.paragraphs[1].sites.items[0].text);
    try std.testing.expectEqualStrings("B", second.paragraphs[2].sites.items[0].text);
    try std.testing.expectEqual(@as(?u32, 2), second.paragraphs[1].generated_id);
    try std.testing.expectEqual(@as(?u32, 3), second.paragraphs[2].generated_id);
    for (second.paragraphs, 0..) |*paragraph, index| {
        const xml = try @import("paragraph_split_xml.zig").writeSites(a, &tree, paragraph.template_element, &paragraph.sites, paragraph.generated_id != null, paragraph.generated_id orelse 0, 10000);
        defer a.free(xml);
        const expected = [_][]const u8{
            "<p:p id='1'><p:run><p:t>A</p:t></p:run></p:p>",
            "<p:p id='2'><p:run><p:t>😀</p:t></p:run></p:p>",
            "<p:p id='3'><p:run><p:t>B</p:t></p:run></p:p>",
        };
        try std.testing.expectEqualStrings(expected[index], xml);
    }
    try std.testing.expectError(error.DuplicateParagraphId, prepare(a, &tree, &first, 1, 0, 0, 2, 10000));
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, &tree, &first, 1, 1, 1, 3, 10000));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &tree, &original, 0, 1, 1, 2, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, values: *const model.Values) !void {
            var output = try prepare(allocator, source, values, 1, 2, 2, 3, 10000);
            defer output.deinit(allocator);
        }
    }.run, .{ &tree, &first });
    try std.testing.expectEqualStrings("A😀B", original.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("😀B", first.paragraphs[1].sites.items[0].text);
}
