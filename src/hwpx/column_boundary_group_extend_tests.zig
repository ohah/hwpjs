const std = @import("std");

test "column group extension repeats without restoring hidden prefix runs" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A</p:t></p:run></p:p>" ++
        "<p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p>" ++
        "<p:p id='3'><p:run><p:ctrl><p:colPr colCount='3'/></p:ctrl><p:t>C</p:t></p:run></p:p>" ++
        "<p:p id='4'><p:run><p:ctrl><p:colPr colCount='4'/></p:ctrl><p:t>D</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const tree = &session.sections[0].tree;
    var first = try @import("column_boundary_group_extend.zig").prepare(a, tree, &session.sections[0].structure_values.?, 1, 100000);
    defer first.deinit(a);
    const prefix = try @import("column_boundary_joined_xml.zig").writeBase(a, tree, &first.paragraphs[0], .{}, 100000);
    defer a.free(prefix);
    var second = @import("column_boundary_group_extend.zig").prepare(a, tree, &first, 1, 100000) catch |err| {
        std.debug.print("second extension preparation: {s}\n", .{@errorName(err)});
        return err;
    };
    defer second.deinit(a);
    const saved = @import("column_boundary_group_xml.zig").write(a, tree, second.paragraphs[0..2], .{}, 100000) catch |err| {
        std.debug.print("second extension serialization: {s}\n", .{@errorName(err)});
        if (@errorReturnTrace()) |trace| std.debug.dumpErrorReturnTrace(trace);
        return err;
    };
    defer a.free(saved);
    try std.testing.expect(std.mem.startsWith(u8, saved, prefix));
    try std.testing.expectEqual(@as(usize, 4), std.mem.count(u8, saved, "colCount="));
    const current_text = try text(a, second.paragraphs[0..2]);
    defer a.free(current_text);
    try std.testing.expectEqualStrings("ABCD", current_text);
    const Probe = struct {
        fn unchanged(current: *const @import("paragraph_structure_values.zig").Values) !void {
            try std.testing.expectEqual(@as(@TypeOf(current.paragraphs[0].pieces.?[2].output), .inventory_only), current.paragraphs[0].pieces.?[2].output);
            try std.testing.expectEqual(@as(@TypeOf(current.paragraphs[1].pieces.?[2].output), .source_runs), current.paragraphs[1].pieces.?[2].output);
            try std.testing.expectEqualStrings("C", current.paragraphs[1].sites.items[2].text);
        }
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_structure_values.zig").Values, expected_prefix: []const u8) !void {
            var result = @import("column_boundary_group_extend.zig").prepare(allocator, parsed, current, 1, 100000) catch |err| {
                try unchanged(current);
                return err;
            };
            defer result.deinit(allocator);
            const output = @import("column_boundary_group_xml.zig").write(allocator, parsed, result.paragraphs[0..2], .{}, 100000) catch |err| {
                try unchanged(current);
                return err;
            };
            defer allocator.free(output);
            try std.testing.expect(std.mem.startsWith(u8, output, expected_prefix));
            try std.testing.expectEqual(@as(usize, 4), std.mem.count(u8, output, "colCount="));
            try unchanged(current);
        }
    };
    try Probe.run(a, tree, &first, prefix);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ tree, &first, prefix });
}

fn text(a: std.mem.Allocator, paragraphs: []const @import("paragraph_structure_values.zig").Paragraph) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (paragraphs) |paragraph| for (paragraph.sites.items) |site| try output.appendSlice(a, site.text);
    return output.toOwnedSlice(a);
}

test "column group extension retains earlier real file XML and continuation identity" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "multicolumns.hwpx", "multicolumns-widths.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        try std.testing.expect(try session.mergeParagraph(0, 1));
        try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
        const before = &session.sections[0].structure_values.?;
        const tree = &session.sections[0].tree;
        const unchanged = try @import("column_boundary_joined_xml.zig").writeBase(a, tree, &before.paragraphs[0], .{}, 1_000_000);
        defer a.free(unchanged);
        var candidate = try @import("column_boundary_group_extend.zig").prepare(a, tree, before, 1, 1_000_000);
        defer candidate.deinit(a);
        try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs.len);
        try std.testing.expectEqual(before.paragraphs[1].generated_id, candidate.paragraphs[1].generated_id);
        const group = try @import("column_boundary_group_xml.zig").write(a, tree, candidate.paragraphs, .{}, 1_000_000);
        defer a.free(group);
        try std.testing.expect(std.mem.startsWith(u8, group, unchanged));
        const expected_text = try text(a, before.paragraphs[1..]);
        defer a.free(expected_text);
        const actual_text = try text(a, candidate.paragraphs[1..]);
        defer a.free(actual_text);
        try std.testing.expectEqualStrings(expected_text, actual_text);
        var resplit = try @import("paragraph_structure_split.zig").prepare(a, tree, &candidate, 1, 1, 1, 99, 1_000_000);
        defer resplit.deinit(a);
        const resplit_xml = try @import("column_boundary_group_xml.zig").write(a, tree, resplit.paragraphs, .{}, 1_000_000);
        defer a.free(resplit_xml);
        const root = tree.elements[0];
        const wrapper = try std.mem.concat(a, u8, &.{ tree.source[root.start_tag.start..root.start_tag.end], resplit_xml, tree.source[root.end_tag.?.start..root.end_tag.?.end] });
        defer a.free(wrapper);
        var parsed = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
        defer parsed.deinit(a);
        var saved_sites = try @import("text_sites.zig").collect(a, &parsed, .{});
        defer saved_sites.deinit(a);
        var saved_text: std.ArrayList(u8) = .empty;
        defer saved_text.deinit(a);
        for (saved_sites.items) |site| try saved_text.appendSlice(a, site.text);
        const complete_text = try text(a, candidate.paragraphs);
        defer a.free(complete_text);
        try std.testing.expectEqualStrings(complete_text, saved_text.items);
        var columns: usize = 0;
        for (parsed.elements) |element| if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
            columns += 1;
        };
        try std.testing.expectEqual(@as(usize, 3), columns);
        var restored = try @import("paragraph_structure_merge.zig").prepare(a, tree, &resplit, 1, 1_000_000);
        defer restored.deinit(a);
        var merged = try @import("paragraph_structure_merge.zig").prepare(a, tree, &restored, 0, 1_000_000);
        defer merged.deinit(a);
        const merged_xml = try @import("column_boundary_joined_xml.zig").write(a, tree, &merged.paragraphs[0], .{}, 1_000_000);
        defer a.free(merged_xml);
        const merged_text = try text(a, merged.paragraphs);
        defer a.free(merged_text);
        try std.testing.expectEqualStrings(complete_text, merged_text);
        try std.testing.expectError(error.UnsupportedColumnBoundaryEdit, @import("column_boundary_group_extend.zig").prepare(a, tree, before, 0, 1_000_000));
        try std.testing.expectError(error.LimitExceeded, @import("column_boundary_group_extend.zig").prepare(a, tree, before, 1, 1));
        var styled = try before.clone(a);
        defer styled.deinit(a);
        styled.paragraphs[1].character_styles = try a.alloc(@import("character_style_paint.zig").Span, 0);
        try std.testing.expectError(error.InvalidTextSites, @import("column_boundary_group_extend.zig").prepare(a, tree, &styled, 1, 1_000_000));
        const still_unchanged = try @import("column_boundary_joined_xml.zig").writeBase(a, tree, &before.paragraphs[0], .{}, 1_000_000);
        defer a.free(still_unchanged);
        try std.testing.expectEqualStrings(unchanged, still_unchanged);
    }
}

test "column group extension preparation preserves input through every allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run></p:p><p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p><p:p id='3'><p:run><p:ctrl><p:colPr colCount='3'/></p:ctrl><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    var pair = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10000);
    defer pair.deinit(a);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &pair, 0, 1, 1, 4, 10000);
    defer split.deinit(a);
    const Probe = struct {
        fn unchanged(current: *const @import("paragraph_structure_values.zig").Values) !void {
            try std.testing.expectEqual(@as(usize, 3), current.paragraphs.len);
            try std.testing.expectEqualStrings("A", current.paragraphs[0].sites.items[0].text);
            try std.testing.expectEqualStrings("😀", current.paragraphs[1].sites.items[0].text);
            try std.testing.expectEqualStrings("B", current.paragraphs[1].sites.items[1].text);
            try std.testing.expectEqualStrings("C", current.paragraphs[2].sites.items[0].text);
            try std.testing.expectEqual(@as(?u32, 4), current.paragraphs[1].generated_id);
            for (current.paragraphs, 0..) |paragraph, ordinal| if (paragraph.character_styles) |spans| for (spans) |span| {
                try std.testing.expectEqual(@as(?u32, if (ordinal == 0) 5 else if (ordinal == 1) 7 else 9), span.char_shape_id);
            };
            for (current.paragraphs) |paragraph| if (paragraph.pieces) |pieces| for (pieces) |piece| {
                try std.testing.expectEqual(@as(@TypeOf(piece.output), .current_runs), piece.output);
            };
        }
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_structure_values.zig").Values) !void {
            defer unchanged(current) catch @panic("SourceChanged");
            var candidate = @import("column_boundary_group_extend.zig").prepare(allocator, parsed, current, 1, 10000) catch |err| {
                try unchanged(current);
                return err;
            };
            defer candidate.deinit(allocator);
            try unchanged(current);
            try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs.len);
            try std.testing.expectEqual(@as(?u32, 4), candidate.paragraphs[1].generated_id);
            try std.testing.expectEqual(@as(@TypeOf(candidate.paragraphs[0].pieces.?[2].output), .inventory_only), candidate.paragraphs[0].pieces.?[2].output);
            try std.testing.expectEqual(@as(@TypeOf(candidate.paragraphs[1].pieces.?[2].output), .source_runs), candidate.paragraphs[1].pieces.?[2].output);
            const saved = @import("column_boundary_group_xml.zig").write(allocator, parsed, candidate.paragraphs, .{}, 10000) catch |err| {
                try unchanged(current);
                return err;
            };
            defer allocator.free(saved);
            try std.testing.expectEqual(@as(usize, 3), std.mem.count(u8, saved, "colCount="));
            try std.testing.expect(std.mem.indexOf(u8, saved, "😀") != null);
            if (current.paragraphs[1].character_styles != null) {
                try std.testing.expect(std.mem.indexOf(u8, saved, "charPrIDRef='5'") != null or std.mem.indexOf(u8, saved, "charPrIDRef=\"5\"") != null);
                try std.testing.expect(std.mem.indexOf(u8, saved, "charPrIDRef='7'") != null or std.mem.indexOf(u8, saved, "charPrIDRef=\"7\"") != null);
                try std.testing.expect(std.mem.indexOf(u8, saved, "charPrIDRef='9'") != null or std.mem.indexOf(u8, saved, "charPrIDRef=\"9\"") != null);
                var resplit = try @import("paragraph_structure_split.zig").prepare(allocator, parsed, &candidate, 1, 2, 2, 99, 10000);
                defer resplit.deinit(allocator);
                var restored = try @import("paragraph_structure_merge.zig").prepare(allocator, parsed, &resplit, 1, 10000);
                defer restored.deinit(allocator);
                const restored_xml = try @import("column_boundary_group_xml.zig").write(allocator, parsed, restored.paragraphs, .{}, 10000);
                defer allocator.free(restored_xml);
                try std.testing.expectEqualStrings(saved, restored_xml);
            }
            try unchanged(current);
        }
    };
    try Probe.run(a, &tree, &split);
    var styled = try split.clone(a);
    defer styled.deinit(a);
    for (styled.paragraphs, 0..) |*paragraph, ordinal| {
        const positions = if (paragraph.joined()) |view|
            try @import("paragraph_joined_positions.zig").build(a, &tree, &view)
        else
            try @import("paragraph_protected_positions.zig").build(a, &tree, paragraph);
        defer a.free(positions);
        const projection = try @import("character_style_projection.zig").build(a, &tree, &paragraph.sites, positions, 100);
        defer a.free(projection);
        paragraph.character_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
        for (paragraph.character_styles.?) |*span| span.char_shape_id = if (ordinal == 0) 5 else if (ordinal == 1) 7 else 9;
    }
    try Probe.run(a, &tree, &styled);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &tree, &split });
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &tree, &styled });
    for (styled.paragraphs, 0..) |paragraph, ordinal| for (paragraph.character_styles.?) |span| {
        try std.testing.expectEqual(@as(?u32, if (ordinal == 0) 5 else if (ordinal == 1) 7 else 9), span.char_shape_id);
    };
    try std.testing.expectEqualStrings(source, tree.source);
}
