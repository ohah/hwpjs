const std = @import("std");

test "column two groups merge candidate is atomic under allocation failures" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run></p:p>" ++
        "<p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p>" ++
        "<p:p id='3'><p:run><p:ctrl><p:colPr colCount='3'/></p:ctrl><p:t>C😀</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    try std.testing.expect(try session.splitParagraph(0, 3, 1, 0));
    const source = &session.sections[0].structure_values.?;
    const tree = &session.sections[0].tree;
    const Probe = struct {
        fn unchanged(values: *const @import("paragraph_structure_values.zig").Values) !void {
            try std.testing.expectEqual(@as(usize, 6), values.paragraphs.len);
            try std.testing.expectEqualStrings("😀", values.paragraphs[1].sites.items[0].text);
            try std.testing.expectEqualStrings("C", values.paragraphs[2].sites.items[0].text);
            try std.testing.expectEqualStrings("😀", values.paragraphs[3].sites.items[0].text);
            for (values.paragraphs[0..4], 0..) |paragraph, ordinal| if (paragraph.character_styles) |spans| for (spans) |span| {
                try std.testing.expectEqual(@as(?u32, @intCast(ordinal + 5)), span.char_shape_id);
            };
        }
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, values: *const @import("paragraph_structure_values.zig").Values) !void {
            defer unchanged(values) catch @panic("SourceChanged");
            var result = @import("column_boundary_groups_merge.zig").prepare(allocator, parsed, values, 1, 100000) catch |err| {
                try unchanged(values);
                return err;
            };
            defer result.deinit(allocator);
            try std.testing.expectEqual(values.paragraphs[3].generated_id, result.paragraphs[2].generated_id);
            const output = @import("column_boundary_group_xml.zig").write(allocator, parsed, result.paragraphs[0..3], .{}, 100000) catch |err| {
                try unchanged(values);
                return err;
            };
            defer allocator.free(output);
            try std.testing.expectEqual(@as(usize, 3), std.mem.count(u8, output, "colCount="));
            if (values.paragraphs[1].character_styles != null) {
                var resplit = try @import("paragraph_structure_split.zig").prepare(allocator, parsed, &result, 2, 2, 2, 99, 100000);
                defer resplit.deinit(allocator);
                var restored = try @import("paragraph_structure_merge.zig").prepare(allocator, parsed, &resplit, 2, 100000);
                defer restored.deinit(allocator);
                const restored_xml = try @import("column_boundary_group_xml.zig").write(allocator, parsed, restored.paragraphs[0..3], .{}, 100000);
                defer allocator.free(restored_xml);
                try std.testing.expectEqualStrings(output, restored_xml);
                try std.testing.expect(try @import("column_boundary_joined_splice.zig").spliceGroup(allocator, parsed, result.paragraphs[0..3], 2, 0, 0, "후😀", 100000));
                const typed = try @import("column_boundary_group_xml.zig").write(allocator, parsed, result.paragraphs[0..3], .{}, 100000);
                defer allocator.free(typed);
                try std.testing.expect(std.mem.indexOf(u8, typed, "후😀") != null);
                try std.testing.expectEqual(@as(usize, 3), std.mem.count(u8, typed, "colCount="));
            }
            try unchanged(values);
        }
    };
    try Probe.run(a, tree, source);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ tree, source });
    var styled = try source.clone(a);
    defer styled.deinit(a);
    for (styled.paragraphs[0..4], 0..) |*paragraph, ordinal| {
        const positions = if (paragraph.joined()) |view|
            try @import("paragraph_joined_positions.zig").build(a, tree, &view)
        else
            try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
        defer a.free(positions);
        const projection = try @import("character_style_projection.zig").build(a, tree, &paragraph.sites, positions, 100);
        defer a.free(projection);
        paragraph.character_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
        for (paragraph.character_styles.?) |*span| span.char_shape_id = @intCast(ordinal + 5);
    }
    try Probe.run(a, tree, &styled);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ tree, &styled });
    for (styled.paragraphs[0..4], 0..) |paragraph, ordinal| for (paragraph.character_styles.?) |span| {
        try std.testing.expectEqual(@as(?u32, @intCast(ordinal + 5)), span.char_shape_id);
    };
    try std.testing.expectError(error.LimitExceeded, @import("column_boundary_groups_merge.zig").prepare(a, tree, source, 1, 1));
    try Probe.unchanged(source);
}
