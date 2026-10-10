const std = @import("std");

test "field joined split draft covers every Unicode boundary and marker affinity" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:ctrl><p:fieldBegin id='77' type='HYPERLINK'/></p:ctrl><p:t>B</p:t></p:run></p:p><p:p><p:run><p:t>C😀</p:t><p:ctrl><p:fieldEnd beginIDRef='77'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer original.deinit(a);
    var merged = try @import("field_source_merge_values.zig").prepare(a, &trees, 0, &original, 0, 1, 100000);
    defer merged.deinit(a);
    const Case = struct { at: u32, left: []const u8, right: []const u8, left_units: []const usize, right_units: []const usize };
    const cases = [_]Case{
        .{ .at = 0, .left = "", .right = "A😀BC😀", .left_units = &.{}, .right_units = &.{ 3, 7 } },
        .{ .at = 1, .left = "A", .right = "😀BC😀", .left_units = &.{}, .right_units = &.{ 2, 6 } },
        .{ .at = 3, .left = "A😀", .right = "BC😀", .left_units = &.{}, .right_units = &.{ 0, 4 } },
        .{ .at = 4, .left = "A😀B", .right = "C😀", .left_units = &.{3}, .right_units = &.{3} },
        .{ .at = 5, .left = "A😀BC", .right = "😀", .left_units = &.{3}, .right_units = &.{2} },
        .{ .at = 7, .left = "A😀BC😀", .right = "", .left_units = &.{ 3, 7 }, .right_units = &.{} },
    };
    for (cases) |case| {
        var split = try @import("field_joined_split_draft.zig").prepare(a, &trees, 0, &merged.paragraphs[0], case.at, case.at, 100000);
        defer split.deinit(a);
        for ([_]*const @import("text_sites.zig").Sites{ &split.text.left.sites, &split.text.right.sites }, [_][]const u8{ case.left, case.right }) |part, expected| {
            var text: std.ArrayList(u8) = .empty;
            defer text.deinit(a);
            for (part.items) |site| try text.appendSlice(a, site.text);
            try std.testing.expectEqualStrings(expected, text.items);
        }
        try std.testing.expectEqual(case.left_units.len, split.left.len);
        try std.testing.expectEqual(case.right_units.len, split.right.len);
        for (split.left, case.left_units) |marker, expected| try std.testing.expectEqual(expected, marker.unit);
        for (split.right, case.right_units) |marker, expected| try std.testing.expectEqual(expected, marker.unit);
        var candidate = try @import("field_joined_split_values.zig").prepare(a, &trees, 0, &merged, 0, case.at, case.at, 99, 100000);
        defer candidate.deinit(a);
        try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs.len);
        try std.testing.expectEqual(@as(?u32, 99), candidate.paragraphs[1].generated_id);
        try std.testing.expect(candidate.paragraphs[1].source_ordinal == null);
        for (candidate.paragraphs[0].pieces.?) |piece| try std.testing.expect(piece.owns_source);
        for (candidate.paragraphs[1].pieces.?) |piece| {
            try std.testing.expect(!piece.owns_source);
            try std.testing.expect(piece.source_ordinal == null);
            try std.testing.expectEqual(@as(?u32, 99), piece.generated_id);
        }
        try std.testing.expectEqualSlices(@import("field_position.zig").Position, split.left, candidate.paragraphs[0].field_positions.?);
        try std.testing.expectEqualSlices(@import("field_position.zig").Position, split.right, candidate.paragraphs[1].field_positions.?);
        var report = try @import("field_markers.zig").inspect(a, &trees, .{});
        defer report.deinit();
        const spans = try @import("field_current_spans.zig").build(a, &trees, 0, &candidate, &report, 100);
        defer a.free(spans);
        try std.testing.expect(spans.len > 0);
        for (spans) |span| try std.testing.expect(span.start <= span.end);
        const output = try @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &candidate, .{}, &.{}, 100000);
        defer a.free(output);
        var parsed = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
        defer parsed.deinit(a);
        const saved_trees = [_]@import("xml_part_tree.zig").Tree{parsed};
        var saved_report = try @import("field_markers.zig").inspect(a, &saved_trees, .{});
        defer saved_report.deinit();
        try std.testing.expectEqual(@as(usize, 2), saved_report.markers.len);
        try std.testing.expectEqual(@as(usize, 0), saved_report.unmatched_begins);
        try std.testing.expectEqual(@as(usize, 0), saved_report.unresolved_ends);
        var rejoined = try @import("field_joined_merge_values.zig").prepare(a, &trees, 0, &candidate, 0, 1, 100000);
        defer rejoined.deinit(a);
        const restored = try @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &rejoined, .{}, &.{}, 100000);
        defer a.free(restored);
        const baseline = try @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &merged, .{}, &.{}, 100000);
        defer a.free(baseline);
        try std.testing.expectEqualStrings(baseline, restored);
        var repeated = try @import("field_joined_split_values.zig").prepare(a, &trees, 0, &candidate, 1, 0, 0, 100, 100000);
        defer repeated.deinit(a);
        try std.testing.expectEqual(@as(usize, 3), repeated.paragraphs.len);
        var repeated_joined = try @import("field_joined_merge_values.zig").prepare(a, &trees, 0, &repeated, 1, 2, 100000);
        defer repeated_joined.deinit(a);
        const repeated_xml = try @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &repeated_joined, .{}, &.{}, 100000);
        defer a.free(repeated_xml);
        try std.testing.expectEqualStrings(output, repeated_xml);
        const selected: usize = if (candidate.paragraphs[0].field_positions.?.len != 0) 0 else 1;
        candidate.paragraphs[selected].field_positions.?[0].unit += 1;
        try std.testing.expectError(error.InvalidFieldPositions, @import("field_current_spans.zig").build(a, &trees, 0, &candidate, &report, 100));
        candidate.paragraphs[selected].field_positions.?[0].unit -= 1;
        candidate.paragraphs[1].pieces.?[0].owns_source = true;
        try std.testing.expectError(error.SourceBindingMismatch, @import("field_current_spans.zig").build(a, &trees, 0, &candidate, &report, 100));
        candidate.paragraphs[1].pieces.?[0].owns_source = false;
    }
    for ([_]u32{ 2, 6 }) |at| try std.testing.expectError(error.SplitSurrogatePair, @import("field_joined_split_draft.zig").prepare(a, &trees, 0, &merged.paragraphs[0], at, at, 100000));
    const Deletion = struct { start: u32, end: u32, left: []const u8, right: []const u8, finish: usize };
    for ([_]Deletion{
        .{ .start = 3, .end = 7, .left = "A😀", .right = "", .finish = 0 },
        .{ .start = 3, .end = 4, .left = "A😀", .right = "C😀", .finish = 3 },
        .{ .start = 1, .end = 5, .left = "A", .right = "😀", .finish = 2 },
    }) |case| {
        var split = try @import("field_joined_split_draft.zig").prepare(a, &trees, 0, &merged.paragraphs[0], case.start, case.end, 100000);
        defer split.deinit(a);
        try std.testing.expectEqual(@as(usize, 0), split.left.len);
        try std.testing.expectEqual(@as(usize, 2), split.right.len);
        try std.testing.expectEqual(@as(usize, 0), split.right[0].unit);
        try std.testing.expectEqual(case.finish, split.right[1].unit);
        for ([_]*const @import("text_sites.zig").Sites{ &split.text.left.sites, &split.text.right.sites }, [_][]const u8{ case.left, case.right }) |part, expected| {
            var text: std.ArrayList(u8) = .empty;
            defer text.deinit(a);
            for (part.items) |site| try text.appendSlice(a, site.text);
            try std.testing.expectEqualStrings(expected, text.items);
        }
    }
    try std.testing.expectError(error.InvalidTextPosition, @import("field_joined_split_draft.zig").prepare(a, &trees, 0, &merged.paragraphs[0], 5, 3, 100000));
    try std.testing.expectError(error.LimitExceeded, @import("field_joined_split_draft.zig").prepare(a, &trees, 0, &merged.paragraphs[0], 4, 4, 1));
    try std.testing.expectError(error.InvalidParagraphId, @import("field_joined_split_values.zig").prepare(a, &trees, 0, &merged, 0, 4, 4, 0, 100000));
    try std.testing.expectError(error.InvalidParagraphIndex, @import("field_joined_split_values.zig").prepare(a, &trees, 0, &merged, 1, 4, 4, 99, 100000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, inputs: []const @import("xml_part_tree.zig").Tree, values: *const @import("paragraph_structure_values.zig").Values) !void {
            var result = try @import("field_joined_split_values.zig").prepare(allocator, inputs, 0, values, 0, 4, 4, 99, 100000);
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), result.paragraphs.len);
            try std.testing.expectEqual(@as(usize, 1), result.paragraphs[0].field_positions.?.len);
            try std.testing.expectEqual(@as(usize, 1), result.paragraphs[1].field_positions.?.len);
            var report = try @import("field_markers.zig").inspect(allocator, inputs, .{});
            defer report.deinit();
            const spans = try @import("field_current_spans.zig").build(allocator, inputs, 0, &result, &report, 100);
            defer allocator.free(spans);
            try std.testing.expectEqual(@as(usize, 2), spans.len);
            var restored = try @import("field_joined_merge_values.zig").prepare(allocator, inputs, 0, &result, 0, 1, 100000);
            defer restored.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), restored.paragraphs.len);
            try std.testing.expectEqualStrings("A😀", restored.paragraphs[0].sites.items[0].text);
            try std.testing.expectEqual(@as(usize, 7), restored.paragraphs[0].field_positions.?[1].unit);
        }
    }.run, .{ &trees, &merged });
    try std.testing.expectEqualStrings(xml, tree.source);
}
