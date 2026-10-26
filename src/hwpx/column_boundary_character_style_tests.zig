const std = @import("std");

test "column styled source merge preserves inputs under allocation failures" {
    const a = std.testing.allocator;
    const Tree = @import("xml_part_tree.zig").Tree;
    const model = @import("paragraph_structure_values.zig");
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='1'><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run></p:p><p:p id='2'><p:run charPrIDRef='2'><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    for (original.paragraphs) |*paragraph| {
        const positions = try @import("paragraph_protected_positions.zig").build(a, &tree, paragraph);
        defer a.free(positions);
        const projection = try @import("character_style_projection.zig").build(a, &tree, &paragraph.sites, positions, 100);
        defer a.free(projection);
        paragraph.character_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    }
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const model.Values) !void {
            var result = try @import("column_boundary_source_merge.zig").prepare(allocator, parsed, source, 0, 100000);
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), result.paragraphs[0].column_boundaries.?.len);
            try std.testing.expectEqual(@as(usize, 2), result.paragraphs[0].character_styles.?.len);
            const xml = try @import("column_boundary_joined_xml.zig").write(allocator, parsed, &result.paragraphs[0], .{}, 100000);
            defer allocator.free(xml);
            try std.testing.expect(std.mem.indexOf(u8, xml, "A😀") != null);
            try std.testing.expect(std.mem.indexOf(u8, xml, "charPrIDRef='2'") != null);
        }
    };
    try Probe.run(a, &tree, &original);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &original });
    try std.testing.expectEqualStrings("A😀", original.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("B", original.paragraphs[1].sites.items[0].text);
    try std.testing.expectEqual(@as(usize, 2), original.paragraphs.len);
}

test "column original character style split save preserves source under allocation failures" {
    const a = std.testing.allocator;
    const Tree = @import("xml_part_tree.zig");
    const model = @import("paragraph_structure_values.zig");
    var tree = try Tree.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='1'><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>A😀B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var source: model.Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = try @import("text_sites.zig").collect(a, &tree, .{}) };
    defer source.deinit(a);
    try @import("column_boundary_materialize.zig").install(a, &tree, &source, 100);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree.Tree, original: *const model.Paragraph) !void {
            defer {
                std.debug.assert(original.character_styles == null);
                std.debug.assert(std.mem.eql(u8, original.sites.items[0].text, "A😀B"));
                std.debug.assert(original.column_boundaries.?.len == 1);
            }
            var candidate = try original.clone(allocator);
            defer candidate.deinit(allocator);
            const positions = try @import("paragraph_protected_positions.zig").build(allocator, parsed, &candidate);
            defer allocator.free(positions);
            const projection = try @import("character_style_projection.zig").build(allocator, parsed, &candidate.sites, positions, 100);
            defer allocator.free(projection);
            const spans = try @import("character_style_paint.zig").fromProjection(allocator, projection, 100);
            defer allocator.free(spans);
            candidate.character_styles = try @import("character_style_paint.zig").prepare(allocator, &candidate.sites, spans, 0, 3, 7, &.{ 1, 7 }, 100);
            var rows = [_]model.Paragraph{candidate};
            const current: model.Values = .{ .paragraphs = &rows };
            var split = try @import("column_boundary_split.zig").prepare(allocator, parsed, &current, 0, 1, 1, 99, 100000, false);
            defer split.deinit(allocator);
            const xml = try @import("column_boundary_group_xml.zig").write(allocator, parsed, split.paragraphs, .{}, 100000);
            defer allocator.free(xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "colCount="));
            try std.testing.expect(std.mem.indexOf(u8, xml, "😀") != null);
            try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, xml, "charPrIDRef='7'"));
            var merged = try @import("column_boundary_merge.zig").prepare(allocator, parsed, &split, 0, 100000);
            defer merged.deinit(allocator);
            const restored = try @import("column_boundary_current_xml.zig").write(allocator, parsed, &merged.paragraphs[0], .{}, 100000);
            defer allocator.free(restored);
            const baseline = try @import("column_boundary_current_xml.zig").write(allocator, parsed, &candidate, .{}, 100000);
            defer allocator.free(baseline);
            try std.testing.expectEqualStrings(baseline, restored);
            try std.testing.expect(try @import("column_boundary_splice.zig").spliceGroup(allocator, parsed, split.paragraphs, 1, 0, 0, "후😀", 100000, false));
            const typed = try @import("column_boundary_group_xml.zig").write(allocator, parsed, split.paragraphs, .{}, 100000);
            defer allocator.free(typed);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, typed, "colCount="));
            try std.testing.expect(std.mem.indexOf(u8, typed, "후😀") != null);
        }
    };
    try Probe.run(a, &tree, &source);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &source });
}

test "column joined character style candidate and save preserve source under allocation failures" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run charPrIDRef='1'><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run></p:p>" ++
        "<p:p id='2'><p:run charPrIDRef='1'><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const tree = &session.sections[0].tree;
    const source = &session.sections[0].structure_values.?.paragraphs[0];
    const Probe = struct {
        fn unchanged(paragraph: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            try std.testing.expect(paragraph.character_styles == null);
            try std.testing.expectEqualStrings("A😀", paragraph.sites.items[0].text);
            try std.testing.expectEqualStrings("B", paragraph.sites.items[1].text);
            try std.testing.expectEqual(@as(usize, 2), paragraph.column_boundaries.?.len);
        }
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            defer unchanged(paragraph) catch @panic("SourceChanged");
            var candidate = try paragraph.clone(allocator);
            defer candidate.deinit(allocator);
            const joined = candidate.joined().?;
            const positions = try @import("paragraph_joined_positions.zig").build(allocator, parsed, &joined);
            defer allocator.free(positions);
            const projection = try @import("character_style_projection.zig").build(allocator, parsed, &candidate.sites, positions, 100);
            defer allocator.free(projection);
            const original = try @import("character_style_paint.zig").fromProjection(allocator, projection, 100);
            defer allocator.free(original);
            candidate.character_styles = try @import("character_style_paint.zig").prepare(allocator, &candidate.sites, original, 0, 1, 7, &.{ 1, 7 }, 100);
            const xml = try @import("column_boundary_joined_xml.zig").write(allocator, parsed, &candidate, .{}, 100000);
            defer allocator.free(xml);
            try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, xml, "colCount="));
            try std.testing.expect(std.mem.indexOf(u8, xml, "charPrIDRef='7'") != null);
            try std.testing.expect(std.mem.indexOf(u8, xml, "😀") != null);
            const model = @import("paragraph_structure_values.zig");
            var paragraphs = [_]model.Paragraph{candidate};
            const current: model.Values = .{ .paragraphs = &paragraphs };
            var split = try @import("column_boundary_split.zig").prepare(allocator, parsed, &current, 0, 1, 1, 99, 100000, false);
            defer split.deinit(allocator);
            try std.testing.expect(split.paragraphs[0].character_styles != null);
            try std.testing.expect(split.paragraphs[1].character_styles != null);
            var merged = try @import("column_boundary_joined_merge.zig").prepare(allocator, parsed, &split, 0, 100000);
            defer merged.deinit(allocator);
            try std.testing.expect(merged.paragraphs[0].character_styles != null);
            const restored = try @import("column_boundary_joined_xml.zig").write(allocator, parsed, &merged.paragraphs[0], .{}, 100000);
            defer allocator.free(restored);
            try std.testing.expectEqualStrings(xml, restored);
        }
    };
    try Probe.run(a, tree, source);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ tree, source });
    try Probe.unchanged(source);
}
