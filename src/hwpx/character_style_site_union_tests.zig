const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Sites = @import("text_sites.zig").Sites;
const paint = @import("character_style_paint.zig");
const prepare = @import("character_style_site_union.zig").prepare;
test "column retained styled continuations actual fixture merge" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-widths.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.splice(0, 1, 0, 0, "A😀");
    _ = try session.splitParagraph(0, 1, 0, 0);
    _ = try session.splitParagraph(0, 2, 3, 0);
    _ = try session.setCharacterProperties(0, 1, 0, 0, .{ .bold = true });
    _ = try session.setCharacterProperties(0, 2, 0, 3, .{ .bold = true });
    try std.testing.expect(try session.mergeParagraph(0, 1));
}

test "character style site union adds empty provenance without replacing edited styles" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='1'><p:ctrl><p:colPr colCount='2'/></p:ctrl></p:run><p:run charPrIDRef='2'><p:t>A😀B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var original: model.Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = try @import("text_sites.zig").collect(a, &tree, .{}) };
    defer original.deinit(a);
    const positions = try @import("paragraph_protected_positions.zig").build(a, &tree, &original);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &tree, &original.sites, positions, 100);
    defer a.free(projection);
    const defaults = try paint.fromProjection(a, projection, 100);
    defer a.free(defaults);
    original.character_styles = try paint.prepare(a, &original.sites, defaults, 0, 3, 7, &.{ 2, 7 }, 100);
    var selected = try @import("continuation_empty_run.zig").clone(a, &tree, original.template_element, &original.sites);
    defer selected.deinit(a);
    try std.testing.expectEqual(original.sites.items.len + 1, selected.items.len);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, source: *const model.Paragraph, target: *const Sites) !void {
            const output = (try prepare(allocator, parsed, source, target)).?;
            defer allocator.free(output);
            try std.testing.expectEqual(@as(usize, 3), output.len);
            try std.testing.expectEqual(@as(?u32, 1), output[0].char_shape_id);
            try std.testing.expectEqual(@as(usize, 0), output[0].end_unit);
            try std.testing.expectEqual(@as(?u32, 7), output[1].char_shape_id);
            try std.testing.expectEqual(@as(usize, 1), output[1].site_index);
            try std.testing.expectEqual(@as(usize, 3), output[1].end_unit);
            try std.testing.expectEqual(@as(?u32, 2), output[2].char_shape_id);
        }
    };
    try Probe.run(a, &tree, &original, &selected);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &tree, &original, &selected });
    try std.testing.expectEqualStrings("A😀B", original.sites.items[0].text);
    var changed = try selected.clone(a);
    defer changed.deinit(a);
    const replacement = try a.dupe(u8, "변경");
    a.free(changed.items[1].text);
    changed.items[1].text = replacement;
    try std.testing.expectError(error.SourceBindingMismatch, prepare(a, &tree, &original, &changed));
    const missing: Sites = .{ .items = selected.items[0..1] };
    try std.testing.expectError(error.SourceBindingMismatch, prepare(a, &tree, &original, &missing));
    try @import("column_boundary_materialize.zig").install(a, &tree, &original, 100);
    const MergeProbe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, source: *const model.Paragraph, different: bool, others: bool) !void {
            var rows = [_]model.Paragraph{source.*};
            const current: model.Values = .{ .paragraphs = &rows };
            var split = try @import("column_boundary_split.zig").prepare(allocator, parsed, &current, 0, 0, 0, 99, 100000, false);
            defer split.deinit(allocator);
            const right = &split.paragraphs[1];
            {
                var extra = try @import("continuation_empty_run.zig").clone(allocator, parsed, right.template_element, &right.sites);
                errdefer extra.deinit(allocator);
                const rebound = (try prepare(allocator, parsed, right, &extra)).?;
                allocator.free(right.character_styles.?);
                right.sites.deinit(allocator);
                right.sites = extra;
                right.character_styles = rebound;
            }
            try std.testing.expectEqual(source.sites.items.len + 1, right.sites.items.len);
            if (different) {
                right.character_styles.?[0].char_shape_id = 7;
            }
            if (others) {
                const extra = try @import("column_boundary_split.zig").prepare(allocator, parsed, &split, 1, 3, 3, 100, 100000, false);
                split.deinit(allocator);
                split = extra;
            }
            var merged = try @import("column_boundary_merge.zig").prepare(allocator, parsed, &split, 0, 100000);
            defer merged.deinit(allocator);
            const paragraph = &merged.paragraphs[0];
            try std.testing.expectEqual(@as(usize, if (different) 4 else 2), paragraph.sites.items.len);
            try std.testing.expectEqualStrings(if (others) "A😀" else "A😀B", paragraph.sites.items[if (different) 3 else 1].text);
            try std.testing.expectEqual(different, paragraph.pieces != null);
            const spans = paragraph.character_styles.?;
            try std.testing.expectEqual(@as(?u32, 1), spans[0].char_shape_id);
            try std.testing.expectEqual(@as(?u32, 7), spans[1].char_shape_id);
            const xml = if (others) try @import("column_boundary_group_xml.zig").write(allocator, parsed, merged.paragraphs, .{}, 100000) else if (different) try @import("column_boundary_joined_xml.zig").write(allocator, parsed, paragraph, .{}, 100000) else try @import("column_boundary_current_xml.zig").write(allocator, parsed, paragraph, .{}, 100000);
            defer allocator.free(xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, "colCount="));
            try std.testing.expect(std.mem.indexOf(u8, xml, "charPrIDRef='7'") != null);
            try std.testing.expect(std.mem.indexOf(u8, xml, "😀") != null);
        }
    };
    for ([_]bool{ false, true }) |different| for ([_]bool{ false, true }) |others| {
        try MergeProbe.run(a, &tree, &original, different, others);
        try @import("../testing/allocation_failures.zig").check(MergeProbe.run, .{ &tree, &original, different, others });
    };
    try std.testing.expectEqualStrings("A😀B", original.sites.items[0].text);
    try std.testing.expectEqual(@as(?u32, 7), original.character_styles.?[0].char_shape_id);
}
