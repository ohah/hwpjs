//! 원본 두 문단의 텍스트 출처와 마커 좌표를 연결하는 미게시 계획입니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Piece = @import("paragraph_joined_values.zig").Piece;
const Position = @import("field_position.zig").Position;

pub const Plan = struct {
    pieces: [2]Piece,
    markers: []Position,
    boundary: usize,

    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.markers);
        self.* = undefined;
    }
};

/// 텍스트/서식/문단 설정은 소유하지 않으며 저장 및 게시 권한도 제공하지 않습니다.
pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, right_index: usize, limit: usize) !Plan {
    if (section >= trees.len) return error.InvalidSectionIndex;
    if (index >= current.paragraphs.len or right_index >= current.paragraphs.len or right_index <= index) return error.InvalidParagraphIndex;
    if (try @import("paragraph_current_neighbor.zig").next(&trees[section], current, index) != right_index) return error.InvalidParagraphAdjacency;
    const left = &current.paragraphs[index];
    const right = &current.paragraphs[right_index];
    for ([_]*const model.Paragraph{ left, right }) |row| {
        if (row.source_ordinal == null or row.generated_id != null or row.pieces != null or row.field_positions != null or row.protected_positions != null or row.column_boundaries != null) return error.UnsupportedStructuralFieldEdit;
    }
    if (left.template_element == right.template_element) return error.SourceBindingMismatch;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    const one = try @import("field_source_positions.zig").build(a, trees, section, left, &report, limit);
    defer a.free(one);
    const two = try @import("field_source_positions.zig").build(a, trees, section, right, &report, limit);
    defer a.free(two);
    var boundary: usize = 0;
    for (left.sites.items) |site| boundary = std.math.add(usize, boundary, try @import("text_site_edit.zig").utf16Length(site.text)) catch return error.LimitExceeded;
    const markers = try @import("field_merge_positions.zig").prepare(a, one, two, boundary, limit);
    return .{ .pieces = .{
        .{ .template_element = left.template_element, .source_ordinal = left.source_ordinal, .generated_id = null, .first_site = 0, .site_count = left.sites.items.len },
        .{ .template_element = right.template_element, .source_ordinal = right.source_ordinal, .generated_id = null, .first_site = left.sites.items.len, .site_count = right.sites.items.len },
    }, .markers = markers, .boundary = boundary };
}

test "field source merge plan preserves actual cross-paragraph links without mutation" {
    const a = std.testing.allocator;
    const path = "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx";
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const part = &session.sections[0];
    const trees = [_]Tree{part.tree};
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &part.tree, &part.sites, part.locations, .{}, &counters);
    defer current.deinit(a);
    for (0..current.paragraphs.len - 1) |index| {
        var plan = try prepare(a, &trees, 0, &current, index, index + 1, 100);
        defer plan.deinit(a);
        try std.testing.expectEqual(current.paragraphs[index].sites.items.len, plan.pieces[1].first_site);
        try std.testing.expect(plan.markers.len > 0);
        for (plan.markers, 0..) |marker, ordinal| {
            if (ordinal != 0) try std.testing.expect(marker.unit >= plan.markers[ordinal - 1].unit);
            try std.testing.expect(marker.begin_element <= marker.element_index);
        }
    }
    try std.testing.expectError(error.InvalidParagraphAdjacency, prepare(a, &trees, 0, &current, 0, 2, 100));
    try std.testing.expectError(error.InvalidSectionIndex, prepare(a, &trees, 1, &current, 0, 1, 100));
    try std.testing.expectError(error.InvalidParagraphIndex, prepare(a, &trees, 0, &current, 1, 0, 100));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &trees, 0, &current, 0, 1, 0));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "field source merge plan allocation failures preserve cross-paragraph Unicode source" {
    const a = std.testing.allocator;
    // This exhaustive loop repeatedly captures allocation/free traces.
    // Keep safety/leak checks, but avoid macOS stack-unwinder memory growth.
    // FailingAllocator still captures the induced-failure diagnostic itself.
    var failure_backing: std.heap.DebugAllocator(.{
        .stack_trace_frames = 0,
        .safety = true,
    }) = .init;
    defer std.testing.expect(failure_backing.deinit() == .ok) catch @panic("failure-loop allocator leak");
    const body = "<p:p id='9'><p:run><p:t>A😀</p:t><p:ctrl><p:fieldBegin id='77' type='HYPERLINK'/></p:ctrl><p:t>B</p:t></p:run></p:p><p:p id='10'><p:run><p:t>C😀</p:t><p:ctrl><p:fieldEnd beginIDRef='77'/></p:ctrl></p:run></p:p>";
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, body);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const trees = [_]Tree{section.tree};
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &counters);
    defer current.deinit(a);
    try std.testing.checkAllAllocationFailures(failure_backing.allocator(), struct {
        fn run(allocator: std.mem.Allocator, inputs: []const Tree, values: *const model.Values) !void {
            var plan = try prepare(allocator, inputs, 0, values, 0, 1, 100);
            defer plan.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 4), plan.boundary);
            try std.testing.expectEqual(@as(usize, 2), plan.markers.len);
            try std.testing.expectEqual(@as(usize, 3), plan.markers[0].unit);
            try std.testing.expectEqual(@as(usize, 7), plan.markers[1].unit);
            try std.testing.expectEqual(plan.markers[0].begin_element, plan.markers[1].begin_element);
            const sites = try allocator.alloc(@import("text_sites.zig").Site, values.paragraphs[0].sites.items.len + values.paragraphs[1].sites.items.len);
            defer allocator.free(sites);
            const left_count = values.paragraphs[0].sites.items.len;
            @memcpy(sites[0..left_count], values.paragraphs[0].sites.items);
            @memcpy(sites[left_count..], values.paragraphs[1].sites.items);
            const joined: @import("paragraph_joined_values.zig").Joined = .{ .pieces = &plan.pieces, .sites = .{ .items = sites } };
            const projected = try @import("paragraph_joined_positions.zig").buildWithFields(allocator, &inputs[0], &joined);
            defer allocator.free(projected);
            try std.testing.expectEqual(@as(usize, 7), projected[projected.len - 1].end_unit);
            try std.testing.expectError(error.SplitSurrogatePair, @import("paragraph_text_positions.zig").validateBoundary(&joined.sites, projected, 2));
            for (projected) |segment| try std.testing.expect(segment.kind == .text);
            var candidate = try @import("field_source_merge_values.zig").prepare(allocator, inputs, 0, values, 0, 1, 100000);
            defer candidate.deinit(allocator);
            try std.testing.expectEqual(values.paragraphs.len - 1, candidate.paragraphs.len);
            try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs[0].pieces.?.len);
            try std.testing.expectEqualSlices(@import("field_position.zig").Position, plan.markers, candidate.paragraphs[0].field_positions.?);
            try std.testing.expectEqualStrings("A😀", candidate.paragraphs[0].sites.items[0].text);
            var checkpoint = try candidate.clone(allocator);
            defer checkpoint.deinit(allocator);
            try std.testing.expectEqualSlices(@import("field_position.zig").Position, candidate.paragraphs[0].field_positions.?, checkpoint.paragraphs[0].field_positions.?);
            const candidate_xml = try @import("field_source_merge_xml.zig").writeCandidate(allocator, inputs, 0, &candidate.paragraphs[0], 100000);
            defer allocator.free(candidate_xml);
            try std.testing.expect(std.mem.indexOf(u8, candidate_xml, "A😀") != null);
            try std.testing.expect(std.mem.indexOf(u8, candidate_xml, "C😀") != null);
            const dirty_xml = try @import("field_source_merge_xml.zig").writeCandidateDirty(allocator, inputs, 0, &candidate.paragraphs[0], &.{.{ .element_index = plan.markers[0].begin_element, .dirty = true }}, 100000);
            defer allocator.free(dirty_xml);
            try std.testing.expect(std.mem.indexOf(u8, dirty_xml, "dirty=\"1\"") != null);
            var field_report = try @import("field_markers.zig").inspect(allocator, inputs, .{});
            defer field_report.deinit();
            const spans = try @import("field_current_spans.zig").build(allocator, inputs, 0, &candidate, &field_report, 100);
            defer allocator.free(spans);
            var found = false;
            for (spans) |span| if (span.begin_element == plan.markers[0].begin_element) {
                try std.testing.expectEqual(@as(usize, 0), span.paragraph_index);
                try std.testing.expectEqual(@as(usize, 3), span.start);
                try std.testing.expectEqual(@as(usize, 7), span.end);
                found = true;
            };
            try std.testing.expect(found);
            const ranges = try @import("field_text_ranges.zig").build(allocator, inputs, &field_report);
            defer allocator.free(ranges);
            const selected = chosen: {
                for (ranges) |range| if (field_report.markers[range.begin_marker].element_index == plan.markers[0].begin_element) break :chosen range;
                return error.InvalidFieldLinks;
            };
            var edited = (try @import("field_label_splice.zig").prepareOwned(allocator, &inputs[0], &candidate.paragraphs[0], selected, 0, .{ .start_unit = 3, .end_unit = 7 }, 3, 0, "입력😀", 100000)).?;
            defer edited.deinit(allocator);
            try std.testing.expectEqualStrings("입력😀B", edited.sites.items[1].text);
            try std.testing.expectEqual(@as(usize, 11), edited.field_positions.?[1].unit);
            try std.testing.expectEqual(@as(usize, 7), candidate.paragraphs[0].field_positions.?[1].unit);
            try std.testing.expectEqualStrings("B", candidate.paragraphs[0].sites.items[1].text);
            const edited_xml = try @import("field_source_merge_xml.zig").writeCandidateDirty(allocator, inputs, 0, &edited, &.{.{ .element_index = plan.markers[0].begin_element, .dirty = true }}, 100000);
            defer allocator.free(edited_xml);
            try std.testing.expect(std.mem.indexOf(u8, edited_xml, "입력😀B") != null);
            var split = try @import("field_joined_split_draft.zig").prepare(allocator, inputs, 0, &candidate.paragraphs[0], 4, 4, 100000);
            defer split.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), split.left.len);
            try std.testing.expectEqual(@as(usize, 1), split.right.len);
            try std.testing.expectEqual(@as(usize, 3), split.left[0].unit);
            try std.testing.expectEqual(@as(usize, 3), split.right[0].unit);
            try std.testing.expectEqualStrings("", split.text.left.sites.items[2].text);
            try std.testing.expectEqualStrings("C😀", split.text.right.sites.items[2].text);
            const style_positions = try @import("field_owned_positions.zig").build(allocator, &inputs[0], &candidate.paragraphs[0]);
            defer allocator.free(style_positions);
            const projection = try @import("character_style_projection.zig").build(allocator, &inputs[0], &candidate.paragraphs[0].sites, style_positions, 1000);
            defer allocator.free(projection);
            const original_styles = try @import("character_style_paint.zig").fromProjection(allocator, projection, 1000);
            defer allocator.free(original_styles);
            candidate.paragraphs[0].character_styles = try @import("character_style_paint.zig").prepare(allocator, &candidate.paragraphs[0].sites, original_styles, 3, 7, 9, &.{9}, 1000);
            const styled = try @import("field_joined_group_xml.zig").write(allocator, inputs, 0, candidate.paragraphs[0..1], &field_report, &.{}, 100000);
            defer allocator.free(styled);
            try std.testing.expect(std.mem.indexOf(u8, styled, "charPrIDRef=\"9\"") != null);
            var styled_split = try @import("field_joined_split_values.zig").prepare(allocator, inputs, 0, &candidate, 0, 4, 4, 99, 100000);
            defer styled_split.deinit(allocator);
            try std.testing.expect(styled_split.paragraphs[0].character_styles != null);
            try std.testing.expect(styled_split.paragraphs[1].character_styles != null);
            const split_xml = try @import("field_joined_group_xml.zig").write(allocator, inputs, 0, styled_split.paragraphs[0..2], &field_report, &.{}, 100000);
            defer allocator.free(split_xml);
            try std.testing.expect(std.mem.indexOf(u8, split_xml, "charPrIDRef=\"9\"") != null);
            var styled_merge = try @import("field_joined_merge_values.zig").prepare(allocator, inputs, 0, &styled_split, 0, 1, 100000);
            defer styled_merge.deinit(allocator);
            const merged_xml = try @import("field_joined_group_xml.zig").write(allocator, inputs, 0, styled_merge.paragraphs[0..1], &field_report, &.{}, 100000);
            defer allocator.free(merged_xml);
            try std.testing.expectEqualStrings(styled, merged_xml);
            var style_edit = (try @import("field_label_splice.zig").prepareOwned(allocator, &inputs[0], &candidate.paragraphs[0], selected, 0, .{ .start_unit = 3, .end_unit = 7 }, 3, 0, "형식😀", 100000)).?;
            defer style_edit.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 11), style_edit.field_positions.?[1].unit);
            try std.testing.expectEqual(@as(usize, 7), candidate.paragraphs[0].field_positions.?[1].unit);
            const style_input = try @import("field_joined_group_xml.zig").write(allocator, inputs, 0, &.{style_edit}, &field_report, &.{.{ .element_index = plan.markers[0].begin_element, .dirty = true }}, 100000);
            defer allocator.free(style_input);
            try std.testing.expect(std.mem.indexOf(u8, style_input, "형식😀B") != null);
        }
    }.run, .{ &trees, &current });
    var styled_sources = try current.clone(a);
    defer styled_sources.deinit(a);
    for (styled_sources.paragraphs[0..2]) |*row| {
        const locations = try @import("paragraph_structure_locations.zig").build(a, &trees[0], row);
        defer a.free(locations);
        const positions = try @import("paragraph_text_positions.zig").build(a, &trees[0], &row.sites, locations, 1);
        defer a.free(positions);
        const projection = try @import("character_style_projection.zig").build(a, &trees[0], &row.sites, positions, 1000);
        defer a.free(projection);
        row.character_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 1000);
        for (row.character_styles.?) |*span| span.char_shape_id = 9;
    }
    try std.testing.checkAllAllocationFailures(failure_backing.allocator(), struct {
        fn run(allocator: std.mem.Allocator, inputs: []const Tree, values: *const model.Values) !void {
            var result = try @import("field_source_merge_values.zig").prepare(allocator, inputs, 0, values, 0, 1, 100000);
            defer result.deinit(allocator);
            for (result.paragraphs[0].character_styles.?) |span| try std.testing.expectEqual(@as(?u32, 9), span.char_shape_id);
            var report = try @import("field_markers.zig").inspect(allocator, inputs, .{});
            defer report.deinit();
            const xml = try @import("field_joined_group_xml.zig").write(allocator, inputs, 0, result.paragraphs[0..1], &report, &.{}, 100000);
            defer allocator.free(xml);
            try std.testing.expect(std.mem.indexOf(u8, xml, "charPrIDRef=\"9\"") != null);
        }
    }.run, .{ &trees, &styled_sources });
    try std.testing.expectEqualStrings("A😀", styled_sources.paragraphs[0].sites.items[0].text);
    for (styled_sources.paragraphs[0..2]) |row| for (row.character_styles.?) |span| try std.testing.expectEqual(@as(?u32, 9), span.char_shape_id);
    var invalid = try @import("field_source_merge_values.zig").prepare(a, &trees, 0, &current, 0, 1, 100000);
    defer invalid.deinit(a);
    const dirty = @import("text_sites_save.zig").FieldDirty{ .element_index = invalid.paragraphs[0].field_positions.?[0].begin_element, .dirty = true };
    try std.testing.expectError(error.DuplicateFieldDirty, @import("field_source_merge_xml.zig").writeCandidateDirty(a, &trees, 0, &invalid.paragraphs[0], &.{ dirty, dirty }, 100000));
    const clean = try @import("field_source_merge_xml.zig").writeCandidateDirty(a, &trees, 0, &invalid.paragraphs[0], &.{.{ .element_index = dirty.element_index, .dirty = false }}, 100000);
    defer a.free(clean);
    try std.testing.expect(std.mem.indexOf(u8, clean, "dirty=\"0\"") != null);
    invalid.paragraphs[0].field_positions.?[1].unit += 1;
    try std.testing.expectError(error.InvalidFieldPositions, @import("field_source_merge_xml.zig").writeCandidate(a, &trees, 0, &invalid.paragraphs[0], 100000));
    var invalid_report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer invalid_report.deinit();
    try std.testing.expectError(error.InvalidFieldPositions, @import("field_current_spans.zig").build(a, &trees, 0, &invalid, &invalid_report, 100));
    invalid.paragraphs[0].field_positions.?[1].unit -= 1;
    invalid.paragraphs[0].pieces.?[1].template_element = invalid.paragraphs[0].pieces.?[0].template_element;
    try std.testing.expectError(error.InvalidParagraphAdjacency, @import("field_source_merge_xml.zig").writeCandidate(a, &trees, 0, &invalid.paragraphs[0], 100000));
    try std.testing.expectEqualStrings("A😀", current.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("C😀", current.paragraphs[1].sites.items[0].text);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
