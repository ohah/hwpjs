//! 검증된 필드 분할 초안을 현재 문단의 텍스트/마커 소유 후보로 조립합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Position = @import("field_position.zig").Position;

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, start: u32, end: u32, id: u32, report: *const @import("field_markers.zig").Report, limit: usize, max_markers: usize) !model.Values {
    return prepareMode(a, trees, section, current, index, start, end, id, report, limit, max_markers, false);
}

/// Coordinates must already be mapped from current computed text by the caller.
pub fn prepareWholeFormula(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, start: u32, end: u32, id: u32, report: *const @import("field_markers.zig").Report, limit: usize, max_markers: usize) !model.Values {
    return prepareMode(a, trees, section, current, index, start, end, id, report, limit, max_markers, true);
}

fn prepareMode(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, start: u32, end: u32, id: u32, report: *const @import("field_markers.zig").Report, limit: usize, max_markers: usize, allow_formula: bool) !model.Values {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (id == 0) return error.InvalidParagraphId;
    const selected = &current.paragraphs[index];
    if (selected.generated_id != null or selected.field_positions != null) return error.UnsupportedStructuralFieldEdit;
    if (selected.source_ordinal == null) return error.SourceBindingMismatch;
    if (selected.column_boundaries != null) return error.UnsupportedStructuralFieldEdit;
    var generated: std.ArrayList(u32) = .empty;
    defer generated.deinit(a);
    for (current.paragraphs) |paragraph| if (paragraph.generated_id) |existing| {
        if (existing == id) return error.DuplicateParagraphId;
        try generated.append(a, existing);
    };
    try generated.append(a, id);
    _ = try @import("paragraph_instance_ids.zig").next(a, trees, generated.items, std.math.maxInt(usize));
    var draft = try @import("field_split_draft.zig").prepare(a, trees, section, selected, report, start, end, limit, max_markers);
    defer draft.deinit(a);
    if (allow_formula) try @import("formula_field_split_guard.zig").validateRange(a, report, section, draft.markers, start, end);
    const count = std.math.add(usize, current.paragraphs.len, 1) catch return error.LimitExceeded;
    const bytes = std.math.mul(usize, count, @sizeOf(model.Paragraph)) catch return error.LimitExceeded;
    if (bytes > limit) return error.LimitExceeded;
    const rows = try a.alloc(model.Paragraph, count);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |*paragraph, ordinal| {
        if (ordinal != index) {
            rows[initialized] = try paragraph.clone(a);
            initialized += 1;
            continue;
        }
        rows[initialized] = .{ .template_element = selected.template_element, .source_ordinal = selected.source_ordinal, .paragraph_shape_id = selected.paragraph_shape_id, .column_structure_changed = selected.column_structure_changed, .sites = try draft.text.left.clone(a) };
        initialized += 1;
        rows[initialized - 1].field_positions = try side(a, draft.markers, .left);
        rows[initialized] = .{ .template_element = selected.template_element, .source_ordinal = null, .generated_id = id, .paragraph_shape_id = selected.paragraph_shape_id, .column_structure_changed = selected.column_structure_changed, .sites = try draft.text.right.clone(a) };
        initialized += 1;
        rows[initialized - 1].field_positions = try side(a, draft.markers, .right);
    }
    const output: model.Values = .{ .paragraphs = rows };
    if (allow_formula) try @import("field_partition.zig").validateWholeFormula(a, trees, section, output.paragraphs[index .. index + 2], report, max_markers) else try @import("field_partition.zig").validate(a, trees, section, output.paragraphs[index .. index + 2], report, max_markers);
    _ = try output.byteSize(limit);
    return output;
}

pub fn side(a: std.mem.Allocator, moves: []const @import("field_split_plan.zig").Move, selected: @import("field_split_plan.zig").Side) ![]Position {
    var count: usize = 0;
    for (moves) |move| if (move.side == selected) {
        count += 1;
    };
    const output = try a.alloc(Position, count);
    var index: usize = 0;
    for (moves) |move| if (move.side == selected) {
        output[index] = move.position;
        output[index].unit = move.unit;
        index += 1;
    };
    return output;
}

test "HWPX field structure split candidate owns both marker sides with atomic allocation failures" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='7'><p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>A😀B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p><p:p id='9'><p:run><p:t>keep</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer current.deinit(a);
    var candidate = try prepare(a, &trees, 0, &current, 0, 1, 1, 8, &report, 10000, 100);
    defer candidate.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), candidate.paragraphs.len);
    try std.testing.expectEqualStrings("A", candidate.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("😀B", candidate.paragraphs[1].sites.items[0].text);
    try std.testing.expectEqualStrings("keep", candidate.paragraphs[2].sites.items[0].text);
    try std.testing.expectEqual(@as(usize, 1), candidate.paragraphs[0].field_positions.?.len);
    try std.testing.expectEqual(@as(usize, 1), candidate.paragraphs[1].field_positions.?.len);
    try std.testing.expectEqual(@as(usize, 3), candidate.paragraphs[1].field_positions.?[0].unit);
    try std.testing.expectEqual(@as(?usize, null), candidate.paragraphs[1].source_ordinal);
    try std.testing.expectEqual(@as(?u32, 8), candidate.paragraphs[1].generated_id);
    const spans = try @import("field_current_spans.zig").build(a, &trees, 0, &candidate, &report, 100);
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 2), spans.len);
    try std.testing.expectEqual(@as(usize, 0), spans[0].paragraph_index);
    try std.testing.expectEqual(@as(usize, 1), spans[0].end);
    try std.testing.expectEqual(@as(usize, 1), spans[1].paragraph_index);
    try std.testing.expectEqual(@as(usize, 3), spans[1].end);
    var styled = try candidate.clone(a);
    defer styled.deinit(a);
    const style_run = tree.elements[styled.paragraphs[1].sites.items[0].element_index].parent.?;
    styled.paragraphs[1].character_styles = try a.dupe(@import("character_style_paint.zig").Span, &.{
        .{ .start_unit = 0, .end_unit = 2, .site_start_unit = 0, .site_index = 0, .run_element = style_run, .char_shape_id = 9 },
        .{ .start_unit = 2, .end_unit = 3, .site_start_unit = 0, .site_index = 0, .run_element = style_run, .char_shape_id = 8 },
    });
    const styled_xml = try @import("field_group_xml.zig").writeStyledDirty(a, &trees, 0, styled.paragraphs[0..2], &report, .{}, &.{}, 10000, 100);
    defer a.free(styled_xml);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, styled_xml, "fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, styled_xml, "fieldEnd"));
    try std.testing.expect(std.mem.indexOf(u8, styled_xml, "<p:t>😀</p:t>") != null);
    styled.paragraphs[1].character_styles.?[0].site_start_unit = 1;
    try std.testing.expectError(error.InvalidTextSites, @import("field_group_xml.zig").writeStyledDirty(a, &trees, 0, styled.paragraphs[0..2], &report, .{}, &.{}, 10000, 100));
    const input_ranges = try @import("field_text_ranges.zig").build(a, &trees, &report);
    defer a.free(input_ranges);
    const dirty_begin = report.markers[input_ranges[0].begin_marker].element_index;
    try std.testing.expectError(error.DuplicateFieldDirty, @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &candidate, .{}, &.{ .{ .element_index = dirty_begin, .dirty = true }, .{ .element_index = dirty_begin, .dirty = false } }, 10000));
    try std.testing.expectError(error.InvalidElementIndex, @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &candidate, .{}, &.{.{ .element_index = tree.elements.len, .dirty = true }}, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, row: *const model.Paragraph, field: @import("field_text_ranges.zig").Range) !void {
            var edited = (try @import("field_label_splice.zig").prepareOwned(allocator, parsed, row, field, 0, .{ .start_unit = 0, .end_unit = 3 }, 0, 0, "한😀<&", 10000)).?;
            defer edited.deinit(allocator);
            try std.testing.expectEqualStrings("한😀<&😀B", edited.sites.items[0].text);
            try std.testing.expectEqual(@as(usize, 8), edited.field_positions.?[0].unit);
            try std.testing.expectEqualStrings("😀B", row.sites.items[0].text);
            try std.testing.expectEqual(@as(usize, 3), row.field_positions.?[0].unit);
        }
    }.run, .{ &tree, &candidate.paragraphs[1], input_ranges[0] });
    try std.testing.expectError(error.SplitSurrogatePair, @import("field_label_splice.zig").prepareOwned(a, &tree, &candidate.paragraphs[1], input_ranges[0], 0, .{ .start_unit = 0, .end_unit = 3 }, 1, 0, "x", 10000));
    try std.testing.expectError(error.InvalidTextPosition, @import("field_label_splice.zig").prepareOwned(a, &tree, &candidate.paragraphs[1], input_ranges[0], 0, .{ .start_unit = 0, .end_unit = 3 }, 3, 1, "x", 10000));
    try std.testing.expectEqual(@as(?model.Paragraph, null), try @import("field_label_splice.zig").prepareOwned(a, &tree, &candidate.paragraphs[1], input_ranges[0], 0, .{ .start_unit = 0, .end_unit = 3 }, 0, 2, "😀", 10000));
    var before_field = try prepare(a, &trees, 0, &current, 0, 0, 0, 8, &report, 10000, 100);
    defer before_field.deinit(a);
    const shifted = try @import("field_current_spans.zig").build(a, &trees, 0, &before_field, &report, 100);
    defer a.free(shifted);
    try std.testing.expectEqual(@as(usize, 1), shifted.len);
    try std.testing.expectEqual(@as(usize, 1), shifted[0].paragraph_index);
    try std.testing.expectEqual(@as(usize, 4), shifted[0].end);
    var empty_field = try prepare(a, &trees, 0, &current, 0, 0, 4, 8, &report, 10000, 100);
    defer empty_field.deinit(a);
    const empty_span = try @import("field_current_spans.zig").build(a, &trees, 0, &empty_field, &report, 100);
    defer a.free(empty_span);
    try std.testing.expectEqual(@as(usize, 1), empty_span.len);
    try std.testing.expectEqual(@as(usize, 1), empty_span[0].paragraph_index);
    try std.testing.expectEqual(@as(usize, 0), empty_span[0].start);
    try std.testing.expectEqual(@as(usize, 0), empty_span[0].end);
    const saved = try @import("field_group_xml.zig").write(a, &trees, 0, candidate.paragraphs[0..2], &report, .{}, 10000, 100);
    defer a.free(saved);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "fieldEnd"));
    try std.testing.expect(std.mem.indexOf(u8, saved, "😀B") != null);
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, prepare(a, &trees, 0, &candidate, 0, 0, 0, 10, &report, 10000, 100));
    try std.testing.expectError(error.InvalidParagraphInstanceId, prepare(a, &trees, 0, &current, 0, 1, 1, 7, &report, 10000, 100));
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, &trees, 0, &current, 0, 2, 2, 8, &report, 10000, 100));
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, @import("paragraph_structure_save.zig").write(a, &tree, &candidate, .{}, &.{}, 10000));
    const partition = @import("field_partition.zig");
    const left_marker = candidate.paragraphs[0].field_positions.?[0];
    const right_marker = candidate.paragraphs[1].field_positions.?[0];
    candidate.paragraphs[1].field_positions.?[0].begin_element = 0;
    try std.testing.expectError(error.SourceBindingMismatch, partition.validate(a, &trees, 0, candidate.paragraphs[0..2], &report, 100));
    candidate.paragraphs[1].field_positions.?[0] = right_marker;
    candidate.paragraphs[1].field_positions.?[0].unit = 1;
    try std.testing.expectError(error.SplitSurrogatePair, partition.validate(a, &trees, 0, candidate.paragraphs[0..2], &report, 100));
    candidate.paragraphs[1].field_positions.?[0].unit = 2;
    try std.testing.expectError(error.InvalidFieldPositions, partition.validate(a, &trees, 0, candidate.paragraphs[0..2], &report, 100));
    candidate.paragraphs[1].field_positions.?[0] = left_marker;
    try std.testing.expectError(error.SourceBindingMismatch, partition.validate(a, &trees, 0, candidate.paragraphs[0..2], &report, 100));
    candidate.paragraphs[0].field_positions.?[0] = right_marker;
    candidate.paragraphs[0].field_positions.?[0].unit = 1;
    candidate.paragraphs[1].field_positions.?[0] = left_marker;
    try std.testing.expectError(error.InvalidFieldLinks, partition.validate(a, &trees, 0, candidate.paragraphs[0..2], &report, 100));
    candidate.paragraphs[0].field_positions.?[0] = left_marker;
    candidate.paragraphs[1].field_positions.?[0] = right_marker;
    const right_owned = candidate.paragraphs[1].field_positions.?;
    candidate.paragraphs[1].field_positions = right_owned[0..0];
    try std.testing.expectError(error.SourceBindingMismatch, partition.validate(a, &trees, 0, candidate.paragraphs[0..2], &report, 100));
    candidate.paragraphs[1].field_positions = right_owned;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, inputs: []const Tree, before: *const model.Values, linked: *const @import("field_markers.zig").Report) !void {
            var deletion_dirty = try @import("field_split_dirty.zig").prepare(allocator, inputs, 0, before, 0, 0, 1, &.{});
            defer deletion_dirty.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), deletion_dirty.items.len);
            try std.testing.expect(deletion_dirty.items[0].dirty);
            var styled_original = try before.clone(allocator);
            defer styled_original.deinit(allocator);
            const original_run = inputs[0].elements[styled_original.paragraphs[0].sites.items[0].element_index].parent.?;
            styled_original.paragraphs[0].character_styles = try allocator.dupe(@import("character_style_paint.zig").Span, &.{
                .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = original_run, .char_shape_id = 9 },
                .{ .start_unit = 1, .end_unit = 4, .site_start_unit = 0, .site_index = 0, .run_element = original_run, .char_shape_id = 8 },
            });
            var first_styled = (try @import("field_split_session_candidate.zig").prepare(allocator, inputs, 0, &styled_original, 0, 1, 1, 12, 10000, 100)).?;
            defer first_styled.deinit(allocator);
            try std.testing.expectEqual(@as(?u32, 9), first_styled.paragraphs[0].character_styles.?[0].char_shape_id);
            try std.testing.expectEqual(@as(?u32, 8), first_styled.paragraphs[1].character_styles.?[0].char_shape_id);
            try std.testing.expect(styled_original.paragraphs[0].field_positions == null);
            var result = try prepare(allocator, inputs, 0, before, 0, 1, 1, 8, linked, 10000, 100);
            defer result.deinit(allocator);
            var repeated = try @import("field_current_split.zig").prepare(allocator, inputs, 0, &result, 1, 2, 2, 10, linked, 10000, 100);
            defer repeated.deinit(allocator);
            try std.testing.expectEqualStrings("😀", repeated.paragraphs[1].sites.items[0].text);
            try std.testing.expectEqualStrings("B", repeated.paragraphs[2].sites.items[0].text);
            const repeated_xml = try @import("paragraph_structure_save.zig").writeWithFieldGroups(allocator, inputs, 0, &repeated, .{}, &.{}, 10000);
            defer allocator.free(repeated_xml);
            var rejoined = try @import("field_current_merge.zig").prepare(allocator, inputs, 0, &repeated, 1, 2, 10000);
            defer rejoined.deinit(allocator);
            try std.testing.expectEqualStrings("😀B", rejoined.paragraphs[1].sites.items[0].text);
            const rejoined_xml = try @import("paragraph_structure_save.zig").writeWithFieldGroups(allocator, inputs, 0, &rejoined, .{}, &.{}, 10000);
            defer allocator.free(rejoined_xml);
            const serialized = try @import("field_group_xml.zig").write(allocator, inputs, 0, result.paragraphs[0..2], linked, .{}, 10000, 100);
            defer allocator.free(serialized);
            const section_xml = try @import("paragraph_structure_save.zig").writeWithFieldGroups(allocator, inputs, 0, &result, .{}, &.{.{ .element_index = linked.markers[0].element_index, .dirty = true }}, 10000);
            defer allocator.free(section_xml);
            try std.testing.expect(std.mem.indexOf(u8, section_xml, "keep") != null);
            try std.testing.expect(std.mem.indexOf(u8, section_xml, "dirty=\"1\"") != null);
            const projected_spans = try @import("field_current_spans.zig").build(allocator, inputs, 0, &result, linked, 100);
            defer allocator.free(projected_spans);
            const style_run_index = inputs[0].elements[result.paragraphs[1].sites.items[0].element_index].parent.?;
            result.paragraphs[1].character_styles = try allocator.dupe(@import("character_style_paint.zig").Span, &.{
                .{ .start_unit = 0, .end_unit = 2, .site_start_unit = 0, .site_index = 0, .run_element = style_run_index, .char_shape_id = 9 },
                .{ .start_unit = 2, .end_unit = 3, .site_start_unit = 0, .site_index = 0, .run_element = style_run_index, .char_shape_id = 8 },
            });
            const formatted = try @import("field_group_xml.zig").writeStyledDirty(allocator, inputs, 0, result.paragraphs[0..2], linked, .{}, &.{.{ .element_index = linked.markers[0].element_index, .dirty = true }}, 10000, 100);
            defer allocator.free(formatted);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, formatted, "fieldBegin"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, formatted, "fieldEnd"));
            const field_ranges = try @import("field_text_ranges.zig").build(allocator, inputs, linked);
            defer allocator.free(field_ranges);
            var typed = (try @import("field_label_splice.zig").prepareOwned(allocator, &inputs[0], &result.paragraphs[1], field_ranges[0], 0, .{ .start_unit = 0, .end_unit = 3 }, 0, 0, "서식😀", 10000)).?;
            defer typed.deinit(allocator);
            try std.testing.expectEqualStrings("서식😀😀B", typed.sites.items[0].text);
            try std.testing.expectEqual(@as(usize, 7), typed.field_positions.?[0].unit);
            try std.testing.expectEqualStrings("😀B", result.paragraphs[1].sites.items[0].text);
            try std.testing.expectEqual(@as(usize, 3), result.paragraphs[1].field_positions.?[0].unit);
            var style_split = try @import("field_current_split.zig").prepare(allocator, inputs, 0, &result, 1, 2, 2, 12, linked, 10000, 100);
            defer style_split.deinit(allocator);
            try std.testing.expectEqual(@as(?u32, 9), style_split.paragraphs[1].character_styles.?[0].char_shape_id);
            try std.testing.expectEqual(@as(?u32, 8), style_split.paragraphs[2].character_styles.?[0].char_shape_id);
            const style_split_xml = try @import("field_group_xml.zig").writeDirty(allocator, inputs, 0, style_split.paragraphs[0..3], linked, .{}, &.{}, 10000, 100);
            defer allocator.free(style_split_xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, style_split_xml, "fieldBegin"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, style_split_xml, "fieldEnd"));
            var style_joined = try @import("field_current_merge.zig").prepare(allocator, inputs, 0, &style_split, 1, 2, 10000);
            defer style_joined.deinit(allocator);
            const styles = style_joined.paragraphs[1].character_styles.?;
            try std.testing.expectEqual(@as(usize, 2), styles.len);
            try std.testing.expectEqual(@as(?u32, 9), styles[0].char_shape_id);
            try std.testing.expectEqual(@as(?u32, 8), styles[1].char_shape_id);
            const style_joined_xml = try @import("field_group_xml.zig").writeDirty(allocator, inputs, 0, style_joined.paragraphs[0..2], linked, .{}, &.{}, 10000, 100);
            defer allocator.free(style_joined_xml);
        }
    }.run, .{ &trees, &current, &report });
    try std.testing.expect(current.paragraphs[0].field_positions == null);
    try std.testing.expectEqualStrings("A😀B", current.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "HWPX field structure split candidates retain actual marker inventory and source identities" {
    const a = std.testing.allocator;
    var boundaries: usize = 0;
    for ([_][]const u8{ "hyperlink", "issue144-fields-crossing-lineseg-boundary" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        const trees = [_]Tree{section.tree};
        var report = try @import("field_markers.zig").inspect(a, &trees, .{});
        defer report.deinit();
        var counters: @import("section_text.zig").Report = .{};
        var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, @import("editor_session.zig").siteOptions(session.options), &counters);
        defer current.deinit(a);
        const id = try @import("paragraph_instance_ids.zig").next(a, &trees, &.{}, std.math.maxInt(usize));
        const style_ids = try @import("character_style_resources.zig").ids(&session);
        defer a.free(style_ids);
        for (current.paragraphs, 0..) |*paragraph, index| {
            const positions = try @import("field_source_positions.zig").build(a, &trees, 0, paragraph, &report, 100);
            defer a.free(positions);
            for (positions) |position| {
                const at = std.math.cast(u32, position.unit) orelse return error.LimitExceeded;
                var result = try prepare(a, &trees, 0, &current, index, at, at, id, &report, 4_000_000, 100);
                defer result.deinit(a);
                try std.testing.expectEqual(current.paragraphs.len + 1, result.paragraphs.len);
                try std.testing.expectEqual(positions.len, result.paragraphs[index].field_positions.?.len + result.paragraphs[index + 1].field_positions.?.len);
                try std.testing.expectEqual(paragraph.source_ordinal, result.paragraphs[index].source_ordinal);
                try std.testing.expectEqual(@as(?usize, null), result.paragraphs[index + 1].source_ordinal);
                var styled_values = try result.clone(a);
                defer styled_values.deinit(a);
                for (styled_values.paragraphs[index .. index + 2]) |*row| {
                    const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, row);
                    defer a.free(locations);
                    const segments = try @import("paragraph_text_positions.zig").build(a, &section.tree, &row.sites, locations, 1);
                    defer a.free(segments);
                    const projection = try @import("character_style_projection.zig").build(a, &section.tree, &row.sites, segments, 10000);
                    defer a.free(projection);
                    const original_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 10000);
                    defer a.free(original_styles);
                    const length = segments[segments.len - 1].end_unit;
                    row.character_styles = try @import("character_style_paint.zig").prepare(a, &row.sites, original_styles, 0, @intCast(length), style_ids[0], style_ids, 10000);
                }
                const styled_group = try @import("field_group_xml.zig").writeStyledDirty(a, &trees, 0, styled_values.paragraphs[index .. index + 2], &report, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000, 100);
                defer a.free(styled_group);
                const styled_node = section.tree.elements[paragraph.template_element];
                const styled_section = try @import("xml_source_writer.zig").write(a, section.tree.source, &.{.{ .start = styled_node.start_tag.start, .end = styled_node.end, .text = "", .serialized_xml = styled_group }}, 4_000_000);
                defer a.free(styled_section);
                var styled_tree = try @import("xml_part_tree.zig").parse(a, styled_section, .section, 0, 0, .{});
                defer styled_tree.deinit(a);
                var styled_markers = try @import("field_markers.zig").inspect(a, &.{styled_tree}, .{});
                defer styled_markers.deinit();
                if (report.markers.len != styled_markers.markers.len) {
                    std.debug.print("styled fixture={s} paragraph={d} at={d}\n", .{ name, index, at });
                    for (styled_markers.markers) |marker| std.debug.print("marker {d}: {s}\n", .{ marker.element_index, marker.raw_xml[0..@min(marker.raw_xml.len, 100)] });
                }
                try std.testing.expectEqual(report.markers.len, styled_markers.markers.len);
                try std.testing.expectEqual(@as(usize, 0), styled_markers.unmatched_begins);
                try std.testing.expectEqual(@as(usize, 0), styled_markers.unresolved_ends);
                for (report.markers, styled_markers.markers) |old, formatted| try std.testing.expectEqualStrings(old.raw_xml, formatted.raw_xml);
                var styled_sites = try @import("text_sites.zig").collect(a, &styled_tree, @import("editor_session.zig").siteOptions(session.options));
                defer styled_sites.deinit(a);
                var before_text: std.ArrayList(u8) = .empty;
                defer before_text.deinit(a);
                var after_text: std.ArrayList(u8) = .empty;
                defer after_text.deinit(a);
                for (section.sites.items) |site| try before_text.appendSlice(a, site.text);
                for (styled_sites.items) |site| try after_text.appendSlice(a, site.text);
                try std.testing.expectEqualSlices(u8, before_text.items, after_text.items);
                const spans = try @import("field_current_spans.zig").build(a, &trees, 0, &result, &report, 100);
                defer a.free(spans);
                const original_fragments: usize = if (std.mem.eql(u8, name, "hyperlink")) 4 else 3;
                try std.testing.expect(spans.len >= original_fragments);
                const linked_ranges = try @import("field_text_ranges.zig").build(a, &trees, &report);
                defer a.free(linked_ranges);
                for (spans) |span| {
                    if (span.paragraph_index != index and span.paragraph_index != index + 1) continue;
                    const field = find_range: {
                        for (linked_ranges) |range| if (report.markers[range.begin_marker].element_index == span.begin_element) break :find_range range;
                        return error.InvalidFieldElement;
                    };
                    var edited = try result.clone(a);
                    defer edited.deinit(a);
                    const row = &edited.paragraphs[span.paragraph_index];
                    const updated = (try @import("field_label_splice.zig").prepareOwned(a, &section.tree, row, field, 0, .{ .start_unit = span.start, .end_unit = span.end }, @intCast(span.start), 0, "입력😀<&", 4_000_000)).?;
                    row.deinit(a);
                    row.* = updated;
                    try @import("field_partition.zig").validate(a, &trees, 0, edited.paragraphs[index .. index + 2], &report, 100);
                    const after_spans = try @import("field_current_spans.zig").build(a, &trees, 0, &edited, &report, 100);
                    defer a.free(after_spans);
                    var found = false;
                    for (after_spans) |after_span| {
                        if (after_span.paragraph_index != span.paragraph_index or after_span.begin_element != span.begin_element) continue;
                        try std.testing.expectEqual(span.start, after_span.start);
                        try std.testing.expectEqual(span.end + 6, after_span.end);
                        found = true;
                    }
                    try std.testing.expect(found);
                    const saved_input = try @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &edited, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000);
                    defer a.free(saved_input);
                    try std.testing.expect(std.mem.indexOf(u8, saved_input, "입력😀&lt;&amp;") != null);
                    var input_tree = try @import("xml_part_tree.zig").parse(a, saved_input, .section, 0, 0, .{});
                    defer input_tree.deinit(a);
                    var input_report = try @import("field_markers.zig").inspect(a, &.{input_tree}, .{});
                    defer input_report.deinit();
                    try std.testing.expectEqual(report.markers.len, input_report.markers.len);
                    try std.testing.expectEqual(@as(usize, 0), input_report.unmatched_begins);
                    try std.testing.expectEqual(@as(usize, 0), input_report.unresolved_ends);
                    for (report.markers, input_report.markers) |original, saved_marker| try std.testing.expectEqualStrings(original.raw_xml, saved_marker.raw_xml);
                    const dirty_saved = try @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &edited, @import("editor_session.zig").siteOptions(session.options), &.{.{ .element_index = span.begin_element, .dirty = true }}, 4_000_000);
                    defer a.free(dirty_saved);
                    const expected_tag = try @import("field_dirty_tag.zig").write(a, &section.tree, span.begin_element, true, 4_000_000);
                    defer a.free(expected_tag);
                    var dirty_tree = try @import("xml_part_tree.zig").parse(a, dirty_saved, .section, 0, 0, .{});
                    defer dirty_tree.deinit(a);
                    var dirty_report = try @import("field_markers.zig").inspect(a, &.{dirty_tree}, .{});
                    defer dirty_report.deinit();
                    try std.testing.expectEqual(report.markers.len, dirty_report.markers.len);
                    for (report.markers, dirty_report.markers) |original, saved_marker| {
                        if (original.element_index == span.begin_element) {
                            const tag = dirty_tree.elements[saved_marker.element_index].start_tag;
                            try std.testing.expectEqualStrings(expected_tag, dirty_tree.source[tag.start..tag.end]);
                        } else try std.testing.expectEqualStrings(original.raw_xml, saved_marker.raw_xml);
                    }
                }
                const replacement = try @import("field_group_xml.zig").write(a, &trees, 0, result.paragraphs[index .. index + 2], &report, @import("editor_session.zig").siteOptions(session.options), 4_000_000, 100);
                defer a.free(replacement);
                const node = section.tree.elements[paragraph.template_element];
                const xml = try @import("xml_source_writer.zig").write(a, section.tree.source, &.{.{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = replacement }}, 4_000_000);
                defer a.free(xml);
                const composed = try @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &result, @import("editor_session.zig").siteOptions(session.options), &.{}, 4_000_000);
                defer a.free(composed);
                try std.testing.expectEqualSlices(u8, xml, composed);
                var reopened = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
                defer reopened.deinit(a);
                var fields = try @import("field_markers.zig").inspect(a, &.{reopened}, .{});
                defer fields.deinit();
                try std.testing.expectEqual(report.markers.len, fields.markers.len);
                try std.testing.expectEqual(@as(usize, 0), fields.unmatched_begins);
                try std.testing.expectEqual(@as(usize, 0), fields.unresolved_ends);
                for (report.markers, fields.markers) |before, after| try std.testing.expectEqualStrings(before.raw_xml, after.raw_xml);
                for (current.paragraphs, 0..) |*source, ordinal| {
                    if (ordinal == index) continue;
                    const copy = &result.paragraphs[ordinal + @as(usize, @intFromBool(ordinal > index))];
                    try std.testing.expectEqual(source.template_element, copy.template_element);
                    try std.testing.expectEqual(source.source_ordinal, copy.source_ordinal);
                    for (source.sites.items, copy.sites.items) |before, after| try std.testing.expectEqualStrings(before.text, after.text);
                }
                boundaries += 1;
            }
        }
        try std.testing.expectEqualSlices(u8, input, session.source);
    }
    try std.testing.expectEqual(@as(usize, 12), boundaries);
}

test "HWPX current field labels query both owned split paragraphs without phantom source labels" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const before = try session.fieldLabels(0, 1);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 1), before.len);
    const section = &session.sections[0];
    const trees = [_]Tree{section.tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, @import("editor_session.zig").siteOptions(session.options), &counters);
    defer current.deinit(a);
    const id = try @import("paragraph_instance_ids.zig").next(a, &trees, &.{}, std.math.maxInt(usize));
    var candidate = try prepare(a, &trees, 0, &current, 0, 1, 1, id, &report, 4_000_000, 100);
    var transferred = false;
    defer if (!transferred) candidate.deinit(a);
    const empty = try a.alloc(@import("text_sites.zig").Site, 0);
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = candidate;
    section.last_paragraph += 1;
    transferred = true;
    const left = try session.fieldLabels(0, 1);
    defer a.free(left);
    const right = try session.fieldLabels(0, 2);
    defer a.free(right);
    try std.testing.expectEqual(@as(usize, 1), left.len);
    try std.testing.expectEqual(@as(usize, 1), right.len);
    try std.testing.expectEqual(before[0].begin_element, left[0].begin_element);
    try std.testing.expectEqual(before[0].begin_element, right[0].begin_element);
    try std.testing.expectEqual(@as(u32, 1), left[0].end);
    try std.testing.expectEqual(@as(u32, 0), right[0].start);
    try std.testing.expectEqual(before[0].end - 1, right[0].end);
    const shifted_candidate = try prepare(a, &trees, 0, &current, 0, 0, 0, id, &report, 4_000_000, 100);
    section.structure_values.?.deinit(a);
    section.structure_values = shifted_candidate;
    const no_label = try session.fieldLabels(0, 1);
    defer a.free(no_label);
    const moved_label = try session.fieldLabels(0, 2);
    defer a.free(moved_label);
    try std.testing.expectEqual(@as(usize, 0), no_label.len);
    try std.testing.expectEqual(@as(usize, 1), moved_label.len);
    try std.testing.expectEqual(before[0].end, moved_label[0].end);
    const split_saved = try session.save();
    defer a.free(split_saved);
    var input_checkpoint = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer input_checkpoint.deinit();
    try std.testing.expect(try session.spliceFieldLabel(0, 2, right[0].begin_element, 0, 0, "X"));
    try std.testing.expectEqual(@as(usize, 1), section.field_dirty.items.len);
    try std.testing.expect(section.field_dirty.items[0].dirty);
    const saved = try session.save();
    defer a.free(saved);
    var reopened_session = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened_session.deinit();
    const reopened_left = try reopened_session.fieldLabels(0, 1);
    defer a.free(reopened_left);
    const reopened_right = try reopened_session.fieldLabels(0, 2);
    defer a.free(reopened_right);
    try std.testing.expectEqual(@as(usize, 0), reopened_left.len);
    try std.testing.expectEqual(@as(usize, 1), reopened_right.len);
    try std.testing.expectEqual(moved_label[0].end + 1, reopened_right[0].end);
    try std.testing.expectError(error.InvalidTextPosition, session.spliceFieldLabel(0, 2, right[0].begin_element, moved_label[0].end + 2, 0, "invalid"));
    const after_error = try session.save();
    defer a.free(after_error);
    try std.testing.expectEqualSlices(u8, saved, after_error);
    try input_checkpoint.exchange(&session);
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, split_saved, undone);
    try std.testing.expectEqual(@as(usize, 0), section.field_dirty.items.len);
    try input_checkpoint.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
