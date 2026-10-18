//! 실제 쪽 영역 원문을 가진 순서형 출처 저장기의 기반 검증입니다.
const std = @import("std");

test "page area ordered pieces preserve alternating source run styles and single declarations" {
    const a = std.testing.allocator;
    const expected = [_][]const u8{ "charPrIDRef='0'", "charPrIDRef='1'", "charPrIDRef='0'", "charPrIDRef='1'" };
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    const options = @import("editor_session.zig").siteOptions(session.options);
    var original = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer original.deinit(a);
    const areas = try @import("page_area_source_positions.zig").collect(a, &section.tree, original.paragraphs[1].template_element, &.{}, 2);
    defer a.free(areas);
    const root = section.tree.elements[0];
    const close = root.end_tag.?;
    const xml = try std.mem.concat(a, u8, &.{ section.tree.source[root.start_tag.start..root.start_tag.end], "<hp:p id='900'><hp:run charPrIDRef='0'><hp:t>AB</hp:t></hp:run><hp:run charPrIDRef='1'>", section.tree.sourceOf(areas[0].source_control), "<hp:t>😀</hp:t>", section.tree.sourceOf(areas[1].source_control), "<hp:t>CD</hp:t></hp:run></hp:p>", section.tree.source[close.start..close.end] });
    defer a.free(xml);
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
    defer a.free(locations);
    report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, options, &report);
    defer values.deinit(a);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 4, 4, 999, 4000000);
    defer split.deinit(a);
    _ = try @import("paragraph_structure_splice.zig").splice(a, &tree, &split, 3, 0, 0, "서식<&", 4000000);
    var left = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &split.paragraphs[0]);
    defer left.deinit(a);
    var right = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &split.paragraphs[3]);
    defer right.deinit(a);
    var joined = try @import("paragraph_joined_merge.zig").prepare(a, &tree, &left, &right, 4000000);
    defer joined.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), joined.pieces.len);
    const owned = try @import("page_area_source_positions.zig").collect(a, &tree, values.paragraphs[0].template_element, &.{}, 2);
    defer a.free(owned);
    owned[0].unit = 2;
    owned[1].unit = 4;
    for (owned) |*area| area.affinity = @import("page_area_position.zig").canonicalAffinity(area.unit);
    const joined_model: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = values.paragraphs[0].template_element, .source_ordinal = values.paragraphs[0].source_ordinal, .sites = joined.sites, .pieces = joined.pieces, .page_area_positions = owned };
    try @import("page_area_joined_validate.zig").validate(a, &tree, &joined_model);
    const footer_control = owned[1].source_control;
    owned[1].source_control = owned[0].source_control;
    try std.testing.expectError(error.SourceBindingMismatch, @import("page_area_joined_validate.zig").validate(a, &tree, &joined_model));
    owned[1].source_control = footer_control;
    owned[0].unit = 3;
    try std.testing.expectError(error.SplitSurrogatePair, @import("page_area_joined_validate.zig").validate(a, &tree, &joined_model));
    owned[0].unit = 2;
    joined.pieces[1].owns_source = true;
    try std.testing.expectError(error.SourceBindingMismatch, @import("page_area_joined_validate.zig").validate(a, &tree, &joined_model));
    joined.pieces[1].owns_source = false;
    const first_piece = joined.pieces[0];
    var generated_model = joined_model;
    generated_model.generated_id = 999;
    generated_model.source_ordinal = null;
    joined.pieces[0].owns_source = false;
    joined.pieces[0].source_ordinal = null;
    joined.pieces[0].generated_id = 1001;
    try std.testing.expectError(error.SourceBindingMismatch, @import("page_area_joined_validate.zig").validateMember(a, &tree, &generated_model));
    joined.pieces[0].generated_id = 999;
    try @import("page_area_joined_validate.zig").validateMember(a, &tree, &generated_model);
    joined.pieces[0] = first_piece;
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source_tree: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            try @import("page_area_joined_validate.zig").validate(allocator, source_tree, current);
        }
    }.run, .{ &tree, &joined_model });
    owned[1].unit = 8;
    const relocated = try @import("page_area_joined_xml.zig").write(a, &tree, &joined_model, options, 4000000);
    defer a.free(relocated);
    const relocated_wrapper = try std.mem.concat(a, u8, &.{ xml[tree.elements[0].start_tag.start..tree.elements[0].start_tag.end], relocated, xml[tree.elements[0].end_tag.?.start..tree.elements[0].end_tag.?.end] });
    defer a.free(relocated_wrapper);
    var moved_tree = try @import("xml_part_tree.zig").parse(a, relocated_wrapper, .section, 0, 0, .{});
    defer moved_tree.deinit(a);
    var moved_sites = try @import("text_sites.zig").collect(a, &moved_tree, options);
    defer moved_sites.deinit(a);
    const moved_locations = try @import("text_site_locations.zig").build(a, &moved_tree, &moved_sites, options);
    defer a.free(moved_locations);
    report = .{};
    var moved_values = try @import("paragraph_structure_collect.zig").collect(a, &moved_tree, &moved_sites, moved_locations, options, &report);
    defer moved_values.deinit(a);
    const moved_segments = try @import("paragraph_protected_positions.zig").build(a, &moved_tree, &moved_values.paragraphs[0]);
    defer a.free(moved_segments);
    const moved_areas = try @import("page_area_source_positions.zig").collect(a, &moved_tree, moved_values.paragraphs[0].template_element, moved_segments, 2);
    defer a.free(moved_areas);
    try std.testing.expectEqual(@as(u32, 2), moved_areas[0].unit);
    try std.testing.expectEqual(@as(u32, 8), moved_areas[1].unit);
    var rows = [_]@import("paragraph_structure_values.zig").Paragraph{ joined_model, split.paragraphs[1], split.paragraphs[2] };
    const section_values: @import("paragraph_structure_values.zig").Values = .{ .paragraphs = &rows };
    const saved_section = try @import("paragraph_structure_save.zig").write(a, &tree, &section_values, options, &.{}, 4000000);
    defer a.free(saved_section);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved_section, relocated));
    var moved_style_count: usize = 0;
    for (moved_tree.elements) |element| {
        if (element.parent != moved_tree.elements[0].first_child or !element.is(@import("document_xml.zig").paragraph_uri, "run")) continue;
        try std.testing.expect(moved_style_count < expected.len);
        try std.testing.expect(std.mem.indexOf(u8, moved_tree.source[element.start_tag.start..element.start_tag.end], expected[moved_style_count]) != null);
        moved_style_count += 1;
    }
    try std.testing.expectEqual(expected.len, moved_style_count);
    const moved_text = try @import("paragraph_protected_positions.zig").text(a, &moved_tree, &moved_values.paragraphs[0], 4000000);
    defer a.free(moved_text);
    try std.testing.expectEqualStrings("AB😀서식<&CD", moved_text);
    for (owned) |area| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, relocated, tree.sourceOf(area.source_element)));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source_tree: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_structure_values.zig").Paragraph, site_options: @import("text_sites.zig").Options, baseline: []const u8) !void {
            const output = try @import("page_area_joined_xml.zig").write(allocator, source_tree, current, site_options, 4000000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(baseline, output);
        }
    }.run, .{ &tree, &joined_model, options, relocated });
    const rendered = try @import("paragraph_joined_xml.zig").write(a, &tree, &joined, options, 4000000);
    defer a.free(rendered);
    const wrapped = try std.mem.concat(a, u8, &.{ xml[tree.elements[0].start_tag.start..tree.elements[0].start_tag.end], rendered, xml[tree.elements[0].end_tag.?.start..tree.elements[0].end_tag.?.end] });
    defer a.free(wrapped);
    var restored = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer restored.deinit(a);
    var style_count: usize = 0;
    for (restored.elements) |element| {
        if (element.parent != restored.elements[0].first_child or !element.is(@import("document_xml.zig").paragraph_uri, "run")) continue;
        try std.testing.expect(style_count < expected.len);
        try std.testing.expect(std.mem.indexOf(u8, restored.source[element.start_tag.start..element.start_tag.end], expected[style_count]) != null);
        style_count += 1;
    }
    try std.testing.expectEqual(expected.len, style_count);
    for (areas) |area| try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, rendered, section.tree.sourceOf(area.source_element)));
    var restored_sites = try @import("text_sites.zig").collect(a, &restored, options);
    defer restored_sites.deinit(a);
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    for (restored_sites.items) |site| {
        if (try @import("paragraph_site_owner.zig").ancestor(&restored, site.element_index) == restored.elements[0].first_child) try text.appendSlice(a, site.text);
    }
    try std.testing.expectEqualStrings("AB😀서식<&CD", text.items);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source_tree: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_joined_values.zig").Joined, site_options: @import("text_sites.zig").Options, baseline: []const u8) !void {
            const output = try @import("paragraph_joined_xml.zig").write(allocator, source_tree, current, site_options, 4000000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(baseline, output);
        }
    }.run, .{ &tree, &joined, options, rendered });
    split.paragraphs[0].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, owned[0..1]);
    split.paragraphs[3].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, owned[1..2]);
    split.paragraphs[3].page_area_positions.?[0].unit = 0;
    split.paragraphs[3].page_area_positions.?[0].affinity = .left;
    try @import("paragraph_page_area_order.zig").repartitionSplit(a, &tree, split.paragraphs, 0, 3);
    var left_baseline = try split.paragraphs[0].sites.clone(a);
    defer left_baseline.deinit(a);
    var right_baseline = try split.paragraphs[2].sites.clone(a);
    defer right_baseline.deinit(a);
    const MergeProbe = struct {
        fn run(allocator: std.mem.Allocator, source_tree: *const @import("xml_part_tree.zig").Tree, before: *const @import("paragraph_structure_values.zig").Values, left_snapshot: *const @import("text_sites.zig").Sites, right_snapshot: *const @import("text_sites.zig").Sites, previous_count: usize, right_unit: u32, merged_unit: u32) !void {
            var output = @import("page_area_structure_merge.zig").prepare(allocator, source_tree, before, 0, 2, 4000000) catch |err| {
                try std.testing.expectEqual(@as(usize, 4), before.paragraphs.len);
                try std.testing.expectEqual(previous_count, if (before.paragraphs[0].pieces) |items| items.len else 0);
                try std.testing.expectEqual(@as(u32, 2), before.paragraphs[0].page_area_positions.?[0].unit);
                try std.testing.expectEqual(right_unit, before.paragraphs[2].page_area_positions.?[0].unit);
                for ([_]usize{ 0, 2 }, [_]*const @import("text_sites.zig").Sites{ left_snapshot, right_snapshot }) |index, snapshot| {
                    try std.testing.expectEqual(snapshot.items.len, before.paragraphs[index].sites.items.len);
                    for (snapshot.items, before.paragraphs[index].sites.items) |expected_site, actual_site| {
                        try std.testing.expectEqualStrings(expected_site.text, actual_site.text);
                        try std.testing.expectEqual(expected_site.element_index, actual_site.element_index);
                        try std.testing.expectEqual(expected_site.start, actual_site.start);
                        try std.testing.expectEqual(expected_site.end, actual_site.end);
                    }
                }
                return err;
            };
            defer output.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), output.paragraphs.len);
            try std.testing.expectEqual(@as(usize, 2), output.paragraphs[0].pieces.?.len);
            try std.testing.expectEqual(@as(u32, 2), output.paragraphs[0].page_area_positions.?[0].unit);
            try std.testing.expectEqual(merged_unit, output.paragraphs[0].page_area_positions.?[1].unit);
            const merged_text = try @import("paragraph_protected_positions.zig").text(allocator, source_tree, &output.paragraphs[0], 4000000);
            defer allocator.free(merged_text);
            try std.testing.expectEqualStrings("AB😀서식<&CD", merged_text);
        }
    };
    try @import("../testing/allocation_failures.zig").check(MergeProbe.run, .{ &tree, &split, &left_baseline, &right_baseline, @as(usize, 0), @as(u32, 0), @as(u32, 4) });
    var ordered_split = try @import("page_area_structure_split.zig").prepare(a, &tree, &section_values, 0, 4, 4, 1001, 4000000);
    defer ordered_split.deinit(a);
    var ordered_left_baseline = try ordered_split.paragraphs[0].sites.clone(a);
    defer ordered_left_baseline.deinit(a);
    var ordered_right_baseline = try ordered_split.paragraphs[2].sites.clone(a);
    defer ordered_right_baseline.deinit(a);
    try @import("../testing/allocation_failures.zig").check(MergeProbe.run, .{ &tree, &ordered_split, &ordered_left_baseline, &ordered_right_baseline, @as(usize, 2), @as(u32, 4), @as(u32, 8) });
}
