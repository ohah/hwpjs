//! 두 원본 호스트의 단 선언과 쪽 영역 좌표를 함께 준비합니다. 게시 권한은 아닙니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub const Plan = struct {
    columns: []@import("column_boundary_position.zig").Position,
    areas: []@import("page_area_position.zig").Position,
    left_units: u32,
    right_units: u32,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.columns);
        a.free(self.areas);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, left: *const Paragraph, right: *const Paragraph, limit: usize) !Plan {
    for ([_]*const Paragraph{ left, right }) |row| {
        if (row.template_element >= tree.elements.len) return error.SourceBindingMismatch;
        if (!tree.elements[row.template_element].is(@import("document_xml.zig").paragraph_uri, "p")) return error.SourceBindingMismatch;
        if (row.generated_id != null or row.source_ordinal == null or row.pieces != null or row.protected_positions != null or row.field_positions != null or row.character_styles != null) return error.UnsupportedMixedMetadataPlan;
    }
    if (tree.elements[left.template_element].parent != tree.elements[right.template_element].parent) return error.CrossParagraphOwner;
    if (tree.elements[left.template_element].next_sibling != right.template_element) return error.InvalidParagraphAdjacency;
    try @import("column_boundary_joined_metadata.zig").validateRightWithPageAreas(tree, right.template_element);
    var first = try left.clone(a);
    defer first.deinit(a);
    var second = try right.clone(a);
    defer second.deinit(a);
    var lengths: [2]u32 = undefined;
    for ([_]*Paragraph{ &first, &second }, 0..) |row, index| {
        const segments = try @import("paragraph_protected_positions.zig").build(a, tree, row);
        defer a.free(segments);
        for (segments) |segment| if (segment.kind != .text) return error.UnsupportedMixedMetadataPlan;
        lengths[index] = std.math.cast(u32, if (segments.len == 0) 0 else segments[segments.len - 1].end_unit) orelse return error.LimitExceeded;
        try @import("column_boundary_materialize.zig").install(a, tree, row, limit);
        try @import("page_area_materialize.zig").install(a, tree, row, limit);
        try @import("column_boundary_partition.zig").validate(a, tree, @as(*[1]Paragraph, @ptrCast(row)));
        var page_view = row.*;
        page_view.column_boundaries = null;
        try @import("page_area_current_validate.zig").validateForRelocation(a, tree, &page_view);
    }
    const columns = try @import("column_boundary_edit.zig").merge(a, first.column_boundaries.?, second.column_boundaries.?, lengths[0], lengths[1], limit);
    errdefer a.free(columns);
    const areas = try @import("page_area_edit.zig").merge(a, first.page_area_positions.?, second.page_area_positions.?, lengths[0], lengths[1], limit);
    errdefer a.free(areas);
    if (columns.len > limit or areas.len > limit - columns.len) return error.LimitExceeded;
    return .{ .columns = columns, .areas = areas, .left_units = lengths[0], .right_units = lengths[1] };
}

test "mixed source metadata plan keeps actual column and page area identities through failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, @import("editor_session.zig").siteOptions(session.options), &report);
    defer values.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, rows: []const Paragraph) !void {
            var result = try prepare(allocator, tree, &rows[0], &rows[1], 3);
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), result.columns.len);
            try std.testing.expectEqual(@as(u32, 0), result.columns[0].unit);
            try std.testing.expectEqual(@import("zero_width_coordinate.zig").Affinity.left, result.columns[0].affinity);
            try std.testing.expectEqual(@as(u32, 5), result.left_units);
            try std.testing.expectEqual(@as(u32, 0), result.right_units);
            try std.testing.expectEqual(@as(usize, 2), result.areas.len);
            for (result.areas) |area| {
                try std.testing.expectEqual(@as(u32, 5), area.unit);
                try std.testing.expectEqual(@import("zero_width_coordinate.zig").Affinity.right, area.affinity);
                try std.testing.expect(tree.elements[area.source_element].parent == area.source_control);
            }
            var left_view = try @import("paragraph_joined_values.zig").Joined.fromParagraph(allocator, &rows[0]);
            defer left_view.deinit(allocator);
            var right_view = try @import("paragraph_joined_values.zig").Joined.fromParagraph(allocator, &rows[1]);
            defer right_view.deinit(allocator);
            if (@import("paragraph_joined_merge.zig").prepare(allocator, tree, &left_view, &right_view, 4000000)) |unexpected| {
                var owned_unexpected = unexpected;
                owned_unexpected.deinit(allocator);
                return error.ExpectedMetadataRefusal;
            } else |err| {
                if (err != error.UnsupportedMergeMetadata) return err;
            }
            var joined = try @import("paragraph_joined_merge.zig").prepareWithColumnPageAreas(allocator, tree, &left_view, &right_view, 4000000);
            defer joined.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), joined.pieces.len);
            try @import("column_boundary_joined_provenance.zig").validate(tree, &joined);
            try std.testing.expectEqual(rows[0].template_element, joined.pieces[0].template_element);
            try std.testing.expectEqual(rows[1].template_element, joined.pieces[1].template_element);
            try std.testing.expect(joined.pieces[0].owns_source and joined.pieces[1].owns_source);
            const mixed: Paragraph = .{ .template_element = rows[0].template_element, .source_ordinal = rows[0].source_ordinal, .sites = joined.sites, .pieces = joined.pieces, .column_boundaries = result.columns, .page_area_positions = result.areas };
            try @import("column_page_area_joined_validate.zig").validate(allocator, tree, &mixed);
            const footer = result.areas[1];
            result.areas[1] = result.areas[0];
            if (@import("column_page_area_joined_validate.zig").validate(allocator, tree, &mixed)) |_| {
                return error.ExpectedMetadataRefusal;
            } else |err| {
                if (err != error.SourceBindingMismatch) return err;
            }
            result.areas[1] = footer;
            const original_column = result.columns[0];
            result.columns[0].unit = 6;
            if (@import("column_page_area_joined_validate.zig").validate(allocator, tree, &mixed)) |_| {
                return error.ExpectedMetadataRefusal;
            } else |err| {
                if (err != error.InvalidTextPosition) return err;
            }
            result.columns[0] = original_column;
            result.columns[0].unit = 2;
            result.columns[0].affinity = .right;
            result.areas[0].unit = 2;
            result.areas[1].unit = 4;
            const fragment = try @import("column_page_area_joined_xml.zig").write(allocator, tree, &mixed, @import("editor_session.zig").siteOptions(.{}), 4000000);
            defer allocator.free(fragment);
            for (result.columns) |column| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, fragment, tree.sourceOf(column.source_element)));
            for (result.areas) |area| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, fragment, tree.sourceOf(area.source_element)));
            const root = tree.elements[0];
            const close = root.end_tag.?;
            const wrapped = try std.mem.concat(allocator, u8, &.{ tree.source[root.start_tag.start..root.start_tag.end], fragment, tree.source[close.start..close.end] });
            defer allocator.free(wrapped);
            var restored = try @import("xml_part_tree.zig").parse(allocator, wrapped, .section, 0, 0, .{});
            defer restored.deinit(allocator);
            const options = @import("editor_session.zig").siteOptions(.{});
            var sites = try @import("text_sites.zig").collect(allocator, &restored, options);
            defer sites.deinit(allocator);
            const locations = try @import("text_site_locations.zig").build(allocator, &restored, &sites, options);
            defer allocator.free(locations);
            var restored_report: @import("section_text.zig").Report = .{};
            var restored_values = try @import("paragraph_structure_collect.zig").collect(allocator, &restored, &sites, locations, options, &restored_report);
            defer restored_values.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), restored_values.paragraphs.len);
            const segments = try @import("paragraph_protected_positions.zig").build(allocator, &restored, &restored_values.paragraphs[0]);
            defer allocator.free(segments);
            const pages = try @import("page_area_source_positions.zig").collect(allocator, &restored, restored_values.paragraphs[0].template_element, segments, 2);
            defer allocator.free(pages);
            try std.testing.expectEqual(@as(usize, 2), pages.len);
            try std.testing.expectEqual(@as(u32, 2), pages[0].unit);
            try std.testing.expectEqual(@as(u32, 4), pages[1].unit);
            const columns = try @import("column_boundary_collect.zig").collect(allocator, &restored, restored_values.paragraphs[0].template_element, segments, .right, 1);
            defer allocator.free(columns);
            try std.testing.expectEqual(@as(usize, 1), columns.len);
            try std.testing.expectEqual(@as(u32, 2), columns[0].unit);
            const body = try @import("paragraph_protected_positions.zig").text(allocator, &restored, &restored_values.paragraphs[0], 4000000);
            defer allocator.free(body);
            try std.testing.expectEqualStrings("첫 페이지", body);
            var borrowed_rows = [_]Paragraph{ mixed, rows[2], rows[3] };
            const borrowed_values: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = &borrowed_rows };
            var edited = try borrowed_values.clone(allocator);
            defer edited.deinit(allocator);
            _ = try @import("paragraph_structure_splice.zig").spliceMode(allocator, tree, &edited, 1, 0, 0, "머리😀", 4000000, true);
            _ = try @import("paragraph_structure_splice.zig").spliceMode(allocator, tree, &edited, 2, 0, 0, "꼬리<&", 4000000, true);
            const original_values: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = @constCast(rows) };
            const current_xml = try @import("column_page_area_joined_xml.zig").writeCurrent(allocator, tree, &edited.paragraphs[0], &edited, &original_values, options, 4000000);
            defer allocator.free(current_xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, current_xml, "머리😀"));
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, current_xml, "꼬리&lt;&amp;"));
            const whole = try @import("paragraph_structure_save.zig").write(allocator, tree, &edited, options, &.{}, 4000000);
            defer allocator.free(whole);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, whole, current_xml));
        }
    };
    // Preserve every failure point and leak/safety checks, isolating replay
    // allocation diagnostics from the shared full-suite allocator lifetime.
    var backing: std.heap.DebugAllocator(.{
        .stack_trace_frames = 0,
        .resize_stack_traces = false,
        .backing_allocator_zeroes = false,
    }) = .{ .backing_allocator = std.heap.page_allocator };
    defer std.testing.expect(backing.deinit() == .ok) catch @panic("mixed metadata verification leaked memory");
    var counter = std.testing.FailingAllocator.init(backing.allocator(), .{});
    try Probe.run(counter.allocator(), &section.tree, values.paragraphs);
    std.debug.print("mixed source metadata plan verification allocations: {d}\n", .{counter.alloc_index});
    try std.testing.checkAllAllocationFailures(backing.allocator(), Probe.run, .{ &section.tree, values.paragraphs });
    try std.testing.expectError(error.LimitExceeded, prepare(a, &section.tree, &values.paragraphs[0], &values.paragraphs[1], 2));
    try std.testing.expectError(error.CrossParagraphOwner, prepare(a, &section.tree, &values.paragraphs[1], &values.paragraphs[2], 3));
    try std.testing.expect(values.paragraphs[0].column_boundaries == null);
    try std.testing.expect(values.paragraphs[1].page_area_positions == null);
}
