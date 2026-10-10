//! 같은 원본 문단의 분할 그룹에 걸친 쪽 영역 소유권을 검증합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph) !void {
    if (paragraphs.len == 0) return error.InvalidPageAreaGroup;
    const first = paragraphs[0];
    if (first.source_ordinal == null or first.generated_id != null) return error.SourceBindingMismatch;
    const inventory = try @import("page_area_source_positions.zig").collect(a, tree, first.template_element, &.{}, tree.elements.len);
    defer a.free(inventory);
    var sources: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer sources.deinit(a);
    var ids: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer ids.deinit(a);
    var count: usize = 0;
    var previous_source: usize = 0;
    for (paragraphs, 0..) |*paragraph, index| {
        if (paragraph.template_element != first.template_element or paragraph.protected_positions != null or paragraph.field_positions != null or paragraph.column_boundaries != null or paragraph.character_styles != null) return error.UnsupportedPageAreaOwnership;
        if (paragraph.pieces != null) try @import("page_area_joined_validate.zig").validateMember(a, tree, paragraph);
        if (index != 0) {
            const id = paragraph.generated_id orelse return error.SourceBindingMismatch;
            if (id == 0 or paragraph.source_ordinal != null or (try ids.getOrPut(a, id)).found_existing) return error.SourceBindingMismatch;
        }
        const owned = paragraph.page_area_positions orelse return error.MissingPageAreaPositions;
        const segments = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
        defer a.free(segments);
        for (owned, 0..) |area, ordinal| {
            if (area.affinity != @import("page_area_position.zig").canonicalAffinity(area.unit)) return error.UnsupportedPageAreaAffinity;
            if (ordinal != 0 and area.unit < owned[ordinal - 1].unit) return error.InvalidPageAreaOrder;
            try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, segments, area.unit);
            if ((try sources.getOrPut(a, area.source_element)).found_existing) return error.DuplicatePageAreaSource;
            if (count >= inventory.len or inventory[count].source_element != area.source_element or inventory[count].source_control != area.source_control) return error.SourceBindingMismatch;
            if (count != 0 and area.source_element <= previous_source) return error.InvalidPageAreaOrder;
            previous_source = area.source_element;
            count += 1;
        }
    }
    if (count != inventory.len) return error.SourceBindingMismatch;
}

test "page area group validates actual left right source ownership through failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.splice(0, 2, 0, 0, "AB😀CD");
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, @import("editor_session.zig").siteOptions(session.options), &report);
    defer original.deinit(a);
    const positions = [_]@import("page_area_position.zig").Position{
        .{ .source_element = 0, .source_control = 0, .unit = 2, .affinity = .right },
        .{ .source_element = 0, .source_control = 0, .unit = 4, .affinity = .right },
    };
    const source = try @import("page_area_source_positions.zig").collect(a, &section.tree, original.paragraphs[1].template_element, &.{}, 2);
    defer a.free(source);
    for (source, positions) |*area, point| {
        area.unit = point.unit;
        area.affinity = point.affinity;
    }
    var parts = try @import("page_area_edit.zig").split(a, source, 4, 4, 6, 2);
    defer parts.deinit(a);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &section.tree, &original, 1, 4, 4, 999, 4000000);
    defer split.deinit(a);
    var group = [_]Paragraph{ split.paragraphs[1], split.paragraphs[4] };
    group[0].page_area_positions = parts.left;
    group[1].page_area_positions = parts.right;
    try validate(a, &section.tree, &group);
    const rendered = try @import("page_area_group_xml.zig").write(a, &section.tree, &group, @import("editor_session.zig").siteOptions(session.options), 4000000);
    defer a.free(rendered);
    const root = section.tree.elements[0];
    const close = root.end_tag.?;
    const wrapper = try std.mem.concat(a, u8, &.{ section.tree.source[root.start_tag.start..root.start_tag.end], rendered, section.tree.source[close.start..close.end] });
    defer a.free(wrapper);
    var restored = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
    defer restored.deinit(a);
    var top: usize = 0;
    var header: usize = 0;
    var footer: usize = 0;
    for (restored.elements, 0..) |element, index| {
        if (element.parent == 0 and element.is(@import("document_xml.zig").paragraph_uri, "p")) top += 1;
        if (element.is(@import("document_xml.zig").paragraph_uri, "header")) {
            header += 1;
            try std.testing.expectEqual(restored.elements[0].first_child, try @import("paragraph_site_owner.zig").ancestor(&restored, index));
        }
        if (element.is(@import("document_xml.zig").paragraph_uri, "footer")) {
            footer += 1;
            try std.testing.expectEqual(restored.elements[restored.elements[0].first_child.?].next_sibling, try @import("paragraph_site_owner.zig").ancestor(&restored, index));
        }
    }
    try std.testing.expectEqual(@as(usize, 2), top);
    try std.testing.expectEqual(@as(usize, 1), header);
    try std.testing.expectEqual(@as(usize, 1), footer);
    _ = try @import("paragraph_structure_splice.zig").spliceMode(a, &section.tree, &split, 2, 0, 0, "머리편집😀", 4000000, true);
    _ = try @import("paragraph_structure_splice.zig").spliceMode(a, &section.tree, &split, 3, 0, 0, "꼬리편집<&", 4000000, true);
    const nested = try @import("page_area_group_xml.zig").writeCurrent(a, &section.tree, &group, &split, &original, @import("editor_session.zig").siteOptions(session.options), 4000000);
    defer a.free(nested);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, nested, "머리편집😀"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, nested, "꼬리편집&lt;&amp;"));
    split.paragraphs[1].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, parts.left);
    split.paragraphs[4].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, parts.right);
    const section_output = try @import("paragraph_structure_save.zig").write(a, &section.tree, &split, @import("editor_session.zig").siteOptions(session.options), &.{}, 4000000);
    defer a.free(section_output);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, section_output, nested));
    const first_owned = split.paragraphs[1].page_area_positions;
    split.paragraphs[1].page_area_positions = null;
    try std.testing.expectError(error.MissingPageAreaPositions, @import("paragraph_structure_save.zig").write(a, &section.tree, &split, @import("editor_session.zig").siteOptions(session.options), &.{}, 4000000));
    split.paragraphs[1].page_area_positions = first_owned;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, source_rows: []const Paragraph) !void {
            const rows = try allocator.dupe(Paragraph, source_rows);
            defer allocator.free(rows);
            @import("paragraph_page_area_order.zig").repartitionSplit(allocator, tree, rows, 1, 4) catch |err| {
                for (rows, source_rows) |after, before| {
                    try std.testing.expectEqual(before.template_element, after.template_element);
                    try std.testing.expectEqual(before.generated_id, after.generated_id);
                    try std.testing.expectEqual(before.sites.items.ptr, after.sites.items.ptr);
                }
                return err;
            };
            try std.testing.expectEqual(@as(?u32, 999), rows[3].generated_id);
        }
    }.run, .{ &section.tree, split.paragraphs });
    try @import("paragraph_page_area_order.zig").repartitionSplit(a, &section.tree, split.paragraphs, 1, 4);
    try std.testing.expectEqual(@as(?u32, 999), split.paragraphs[3].generated_id);
    try std.testing.expectEqual(original.paragraphs[2].template_element, split.paragraphs[2].template_element);
    try std.testing.expectEqual(original.paragraphs[3].template_element, split.paragraphs[4].template_element);
    const ordered_section = try @import("paragraph_structure_save.zig").write(a, &section.tree, &split, @import("editor_session.zig").siteOptions(session.options), &.{}, 4000000);
    defer a.free(ordered_section);
    try std.testing.expectEqualStrings(section_output, ordered_section);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, rows: []const Paragraph, current: *const @import("paragraph_structure_values.zig").Values, baseline: *const @import("paragraph_structure_values.zig").Values, options: @import("text_sites.zig").Options, expected: []const u8) !void {
            const output = try @import("page_area_group_xml.zig").writeCurrent(allocator, tree, rows, current, baseline, options, 4000000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(expected, output);
        }
    }.run, .{ &section.tree, &group, &split, &original, @import("editor_session.zig").siteOptions(session.options), nested });
    var restored_sites = try @import("text_sites.zig").collect(a, &restored, @import("editor_session.zig").siteOptions(session.options));
    defer restored_sites.deinit(a);
    const restored_locations = try @import("text_site_locations.zig").build(a, &restored, &restored_sites, @import("editor_session.zig").siteOptions(session.options));
    defer a.free(restored_locations);
    var restored_report: @import("section_text.zig").Report = .{};
    var restored_values = try @import("paragraph_structure_collect.zig").collect(a, &restored, &restored_sites, restored_locations, @import("editor_session.zig").siteOptions(session.options), &restored_report);
    defer restored_values.deinit(a);
    const left = &restored_values.paragraphs[0];
    const right = &restored_values.paragraphs[2];
    for ([_]*const Paragraph{ left, right }, [_]u32{ 2, 0 }, [_][]const u8{ "AB😀", "CD" }) |row, expected_unit, expected_text| {
        const segments = try @import("paragraph_protected_positions.zig").build(a, &restored, row);
        defer a.free(segments);
        const areas = try @import("page_area_source_positions.zig").collect(a, &restored, row.template_element, segments, 2);
        defer a.free(areas);
        try std.testing.expectEqual(@as(usize, 1), areas.len);
        try std.testing.expectEqual(expected_unit, areas[0].unit);
        var text: std.ArrayList(u8) = .empty;
        defer text.deinit(a);
        for (row.sites.items) |site| if (!site.anchor_boundary) {
            try text.appendSlice(a, site.text);
        };
        try std.testing.expectEqualStrings(expected_text, text.items);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, rows: []const Paragraph, options: @import("text_sites.zig").Options, expected: []const u8) !void {
            const output = try @import("page_area_group_xml.zig").write(allocator, tree, rows, options, 4000000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(expected, output);
        }
    }.run, .{ &section.tree, &group, @import("editor_session.zig").siteOptions(session.options), rendered });
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, rows: []const Paragraph) !void {
            try validate(allocator, tree, rows);
        }
    }.run, .{ &section.tree, &group });
    group[1].generated_id = null;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, &group));
    group[1].generated_id = 999;
    const original_footer = parts.right[0];
    parts.right[0] = parts.left[0];
    try std.testing.expectError(error.DuplicatePageAreaSource, validate(a, &section.tree, &group));
    parts.right[0] = original_footer;
    group[1].page_area_positions = &.{};
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &section.tree, &group));
    try std.testing.expectEqual(@as(usize, 1), parts.left.len);
    try std.testing.expectEqual(@as(usize, 1), parts.right.len);
}
