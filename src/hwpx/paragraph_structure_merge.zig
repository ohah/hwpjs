//! Replace two logical paragraphs with one sole text owner, atomically.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Joined = @import("paragraph_joined_values.zig").Joined;

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const model.Values, index: usize, limit: usize) !model.Values {
    if (index >= current.paragraphs.len or current.paragraphs.len - index < 2) return error.InvalidParagraphIndex;
    return preparePair(a, tree, current, index, index + 1, limit);
}

pub fn preparePair(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const model.Values, index: usize, right_index: usize, limit: usize) !model.Values {
    if (index >= current.paragraphs.len or right_index >= current.paragraphs.len or right_index <= index) return error.InvalidParagraphIndex;
    if (right_index != index + 1) {
        const adjacent = try @import("paragraph_current_neighbor.zig").next(tree, current, index);
        if (adjacent != right_index) return error.InvalidParagraphAdjacency;
    }
    const selected = &current.paragraphs[index];
    const next = &current.paragraphs[right_index];
    if (selected.field_positions != null or next.field_positions != null) return error.UnsupportedStructuralFieldEdit;
    if (selected.page_area_positions != null and next.page_area_positions != null and selected.column_boundaries != null and next.column_boundaries != null and selected.pieces != null and next.pieces != null) return @import("column_page_area_group_merge.zig").prepare(a, tree, current, index, right_index, limit);
    if (@import("column_page_area_source_merge.zig").eligible(tree, selected, next)) return @import("column_page_area_source_merge.zig").prepare(a, tree, current, index, right_index, limit);
    if (selected.page_area_positions != null or next.page_area_positions != null) return @import("page_area_structure_merge.zig").prepare(a, tree, current, index, right_index, limit);
    if (right_index == index + 1 and selected.template_element == next.template_element and selected.pieces != null and next.pieces != null and selected.column_boundaries != null and next.column_boundaries != null and selected.protected_positions != null and next.protected_positions != null)
        return @import("column_boundary_joined_tab_merge.zig").prepare(a, tree, current, index, limit);
    for ([_]*const model.Paragraph{ selected, next }) |part| {
        if (part.column_boundaries != null and part.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    }
    if (right_index != index + 1 and (selected.column_boundaries != null or next.column_boundaries != null or
        @import("column_boundary_collect.zig").hasForParagraph(tree, selected.template_element) or
        @import("column_boundary_collect.zig").hasForParagraph(tree, next.template_element)))
        return @import("column_boundary_source_anchor_merge.zig").prepare(a, tree, current, index, right_index, limit);
    if (selected.generated_id != null and selected.template_element != next.template_element and selected.column_boundaries != null) {
        const right_group = try @import("column_boundary_group.zig").locate(current, index + 1);
        if (right_group.end > right_group.start + 1)
            return @import("column_boundary_groups_merge.zig").prepare(a, tree, current, index, limit);
        return @import("column_boundary_group_extend.zig").prepare(a, tree, current, index, limit);
    }
    if (right_index == index + 1 and selected.template_element != next.template_element and next.column_boundaries != null) {
        const right_group = try @import("column_boundary_group.zig").locate(current, right_index);
        if (right_group.start == right_index and right_group.end > right_index + 1) {
            const left_group = try @import("column_boundary_group.zig").locate(current, index);
            if (left_group.end == right_index) return @import("column_boundary_groups_merge.zig").prepare(a, tree, current, index, limit);
        }
    }
    if (selected.template_element == next.template_element and selected.pieces != null and next.pieces != null and selected.column_boundaries != null and next.column_boundaries != null)
        return @import("column_boundary_joined_merge.zig").prepare(a, tree, current, index, limit);
    if (selected.template_element != next.template_element and
        (selected.column_boundaries != null or next.column_boundaries != null or
            @import("column_boundary_collect.zig").hasForParagraph(tree, selected.template_element) or
            @import("column_boundary_collect.zig").hasForParagraph(tree, next.template_element)))
        return @import("column_boundary_source_merge.zig").prepare(a, tree, current, index, limit) catch |err| {
            if (err == error.UnsupportedMergeMetadata and hasDirectAnchor(tree, next.template_element))
                return @import("column_boundary_source_anchor_merge.zig").prepare(a, tree, current, index, right_index, limit);
            if (err != error.UnsupportedInlineControl) return err;
            return @import("column_boundary_source_merge.zig").prepareOwnedTabs(a, tree, current, index, limit);
        };
    if (selected.column_boundaries != null or next.column_boundaries != null) return @import("column_boundary_merge.zig").prepare(a, tree, current, index, limit);
    if (right_index != index + 1)
        return @import("paragraph_source_anchor_merge.zig").prepare(a, tree, current, index, right_index, limit);
    if (selected.protected_positions != null or next.protected_positions != null) {
        const paragraphs = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
        var initialized: usize = 0;
        errdefer {
            for (paragraphs[0..initialized]) |*paragraph| paragraph.deinit(a);
            a.free(paragraphs);
        }
        for (current.paragraphs, 0..) |*paragraph, ordinal| {
            if (ordinal == right_index) continue;
            paragraphs[initialized] = if (ordinal == index) try @import("paragraph_protected_merge.zig").prepare(a, tree, paragraph, next, limit) else try paragraph.clone(a);
            initialized += 1;
        }
        const output: model.Values = .{ .paragraphs = paragraphs };
        _ = try output.byteSize(limit);
        return output;
    }
    var left = try Joined.fromParagraph(a, selected);
    defer left.deinit(a);
    var right = try Joined.fromParagraph(a, next);
    defer right.deinit(a);
    var with_tabs = false;
    var joined = @import("paragraph_joined_merge.zig").prepare(a, tree, &left, &right, limit) catch |err| block: {
        if (err == error.UnsupportedParagraphControl)
            return @import("paragraph_source_anchor_merge.zig").prepare(a, tree, current, index, right_index, limit);
        if (err != error.UnsupportedInlineControl) return err;
        with_tabs = true;
        break :block try @import("paragraph_joined_merge.zig").prepareWithTabs(a, tree, &left, &right, limit);
    };
    var transferred = false;
    defer if (!transferred) joined.deinit(a);
    const left_title_positions = try @import("title_mark_current.zig").read(a, tree, selected);
    defer a.free(left_title_positions);
    const right_title_positions = try @import("title_mark_current.zig").read(a, tree, next);
    defer a.free(right_title_positions);
    const left_title_segments = if (with_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &left) else try @import("paragraph_joined_positions.zig").build(a, tree, &left);
    defer a.free(left_title_segments);
    const right_title_segments = if (with_tabs) try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &right) else try @import("paragraph_joined_positions.zig").build(a, tree, &right);
    defer a.free(right_title_segments);
    const left_title_units = if (left_title_segments.len == 0) 0 else left_title_segments[left_title_segments.len - 1].end_unit;
    const right_title_units = if (right_title_segments.len == 0) 0 else right_title_segments[right_title_segments.len - 1].end_unit;
    const merged_titles = try @import("title_mark_position.zig").merge(a, left_title_positions, right_title_positions, left_title_units, right_title_units);
    var titles_transferred = false;
    defer if (!titles_transferred) a.free(merged_titles);
    const protected = if (with_tabs) block: {
        const segments = try @import("paragraph_joined_positions.zig").buildWithTabs(a, tree, &joined);
        defer a.free(segments);
        break :block try @import("paragraph_protected_positions.zig").side(a, segments, 0, 0, true);
    } else null;
    defer if (!transferred) {
        if (protected) |items| a.free(items);
    };
    const paragraphs = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (paragraphs[0..initialized]) |*paragraph| paragraph.deinit(a);
        a.free(paragraphs);
    }
    for (current.paragraphs, 0..) |paragraph, ordinal| {
        if (ordinal == right_index) continue;
        if (ordinal == index) {
            paragraphs[initialized] = .{ .template_element = selected.template_element, .source_ordinal = selected.source_ordinal, .generated_id = selected.generated_id, .paragraph_shape_id = selected.paragraph_shape_id, .sites = joined.sites, .pieces = joined.pieces, .character_styles = joined.character_styles, .protected_positions = protected, .title_positions = merged_titles };
            titles_transferred = true;
            if (joined.character_styles != null and joined.pieces.len == 1) {
                const piece = joined.pieces[0];
                if (piece.template_element == selected.template_element and piece.source_ordinal == selected.source_ordinal and piece.generated_id == selected.generated_id and piece.owns_source == (selected.generated_id == null)) {
                    a.free(joined.pieces);
                    paragraphs[initialized].pieces = null;
                }
            }
            transferred = true;
        } else paragraphs[initialized] = try paragraph.clone(a);
        initialized += 1;
    }
    const output: model.Values = .{ .paragraphs = paragraphs };
    _ = try output.byteSize(limit);
    return output;
}

fn hasDirectAnchor(tree: *const @import("xml_part_tree.zig").Tree, owner: usize) bool {
    if (owner >= tree.elements.len) return false;
    const uri = @import("document_xml.zig").paragraph_uri;
    var child = tree.elements[owner].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(uri, "run")) continue;
        var content = tree.elements[index].first_child;
        while (content) |node| : (content = tree.elements[node].next_sibling) {
            if (@import("run_anchor.zig").kind(tree, node) != null) return true;
        }
    }
    return false;
}

test "HWPX tab source merge owns tabs atomically through allocation failures" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t></p:run></p:p><p:p><p:run><p:t>😀<p:tab/>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer current.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, before: *const model.Values) !void {
            var candidate = try prepare(allocator, source, before, 0, 10000);
            defer candidate.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), candidate.paragraphs[0].protected_positions.?.len);
            const output = try @import("paragraph_structure_save.zig").write(allocator, source, &candidate, .{}, &.{}, 10000);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "<p:tab/>"));
        }
    }.run, .{ &tree, &current });
    try std.testing.expectEqualStrings(xml, tree.source);
    try std.testing.expectEqualStrings("A", current.paragraphs[0].sites.items[0].text);
}

test "HWPX explicit merge pair preserves adjacent behavior and refuses skipped siblings" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t></p:run></p:p><p:p><p:run><p:t>B</p:t></p:run></p:p><p:p><p:run><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer current.deinit(a);
    try std.testing.expectError(error.InvalidParagraphIndex, preparePair(a, &tree, &current, 1, 1, 10000));
    try std.testing.expectError(error.InvalidParagraphIndex, preparePair(a, &tree, &current, 1, 0, 10000));
    try std.testing.expectError(error.InvalidParagraphIndex, preparePair(a, &tree, &current, 0, 3, 10000));
    try std.testing.expectError(error.InvalidParagraphAdjacency, preparePair(a, &tree, &current, 0, 2, 10000));
    var candidate = try preparePair(a, &tree, &current, 0, 1, 10000);
    defer candidate.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs.len);
    try std.testing.expectEqualStrings("C", candidate.paragraphs[1].sites.items[0].text);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, values: *const model.Values) !void {
            var result = try preparePair(allocator, parsed, values, 0, 1, 10000);
            defer result.deinit(allocator);
        }
    }.run, .{ &tree, &current });
}

test "HWPX explicit merge pair retains actual note owners through host merge" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    const site_options = @import("editor_session.zig").siteOptions(session.options);
    var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, site_options, &report);
    defer current.deinit(a);
    try std.testing.expectEqual(@as(?usize, 3), try @import("paragraph_current_neighbor.zig").next(&section.tree, &current, 0));
    var merged = try preparePair(a, &section.tree, &current, 0, 3, 4_000_000);
    defer merged.deinit(a);
    try std.testing.expectEqual(current.paragraphs.len - 1, merged.paragraphs.len);
    for ([_]usize{ 1, 2 }) |index| try std.testing.expectEqualDeep(current.paragraphs[index], merged.paragraphs[index]);
    const xml = try @import("paragraph_structure_save.zig").writeWithColumnTabs(a, &section.tree, &merged, site_options, &.{}, 4_000_000);
    defer a.free(xml);
    var reopened = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var before_notes = try @import("note_bodies.zig").inspect(a, &.{section.tree}, .{});
    defer before_notes.deinit();
    var after_notes = try @import("note_bodies.zig").inspect(a, &.{reopened}, .{});
    defer after_notes.deinit();
    try std.testing.expect(before_notes.notes.len > 0);
    try std.testing.expectEqual(before_notes.notes.len, after_notes.notes.len);
    for (before_notes.notes, after_notes.notes) |before_note, after_note| {
        try std.testing.expectEqual(before_note.kind, after_note.kind);
        try std.testing.expectEqualStrings(before_note.raw_xml, after_note.raw_xml);
    }
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, values: *const model.Values) !void {
            var result = try preparePair(allocator, parsed, values, 0, 3, 4_000_000);
            defer result.deinit(allocator);
            try std.testing.expectEqual(values.paragraphs.len - 1, result.paragraphs.len);
            for ([_]usize{ 1, 2 }) |index| try std.testing.expectEqualDeep(values.paragraphs[index], result.paragraphs[index]);
        }
    }.run, .{ &section.tree, &current });
}
