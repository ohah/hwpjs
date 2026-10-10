//! Adversarial joined remerge ownership and allocation tests.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("paragraph_structure_values.zig").Values;

fn expectOriginal(current: *const Values) !void {
    try std.testing.expectEqual(@as(usize, 2), current.paragraphs.len);
    try std.testing.expectEqualStrings("A", current.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("😀", current.paragraphs[1].sites.items[0].text);
    try std.testing.expectEqualStrings("B", current.paragraphs[1].sites.items[1].text);
    try std.testing.expectEqual(@as(u32, 0), current.paragraphs[0].column_boundaries.?[0].unit);
    try std.testing.expectEqual(@as(u32, 2), current.paragraphs[1].column_boundaries.?[0].unit);
}

fn verifySaved(a: std.mem.Allocator, source: *const Tree, current: *const Values, expected_texts: []const []const u8) !void {
    const output = try @import("paragraph_structure_save.zig").write(a, source, current, .{}, &.{}, 10000);
    defer a.free(output);
    var tree = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    try std.testing.expectEqual(expected_texts.len, values.paragraphs.len);
    for (values.paragraphs, current.paragraphs, expected_texts) |*actual, expected, text| {
        var joined_text: std.ArrayList(u8) = .empty;
        defer joined_text.deinit(a);
        for (actual.sites.items) |site| try joined_text.appendSlice(a, site.text);
        try std.testing.expectEqualStrings(text, joined_text.items);
        try @import("column_boundary_materialize.zig").install(a, &tree, actual, 100);
        try std.testing.expectEqual(expected.column_boundaries.?.len, actual.column_boundaries.?.len);
        for (actual.column_boundaries.?, expected.column_boundaries.?) |one, two| {
            try std.testing.expectEqual(two.unit, one.unit);
            try std.testing.expectEqualStrings(source.sourceOf(two.source_element), tree.sourceOf(one.source_element));
        }
    }
}

test "joined column source extension merges either adjacent owner without resetting coordinates" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run></p:p><p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p><p:p id='3'><p:run><p:ctrl><p:colPr colCount='3'/></p:ctrl><p:t>C</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    for ([_]usize{ 0, 1 }) |first| {
        var pair = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, first, 10000);
        defer pair.deinit(a);
        try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &tree, &pair, first, 0, 0, "후", 10000));
        var whole = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &pair, 0, 10000);
        defer whole.deinit(a);
        try verifySaved(a, &tree, &whole, if (first == 0) &.{"후A😀BC"} else &.{"A😀후BC"});
        try std.testing.expectEqual(@as(usize, 3), whole.paragraphs[0].column_boundaries.?.len);
        if (first == 0) {
            var split_pair = try @import("paragraph_structure_split.zig").prepare(a, &tree, &pair, 0, 2, 2, 5, 10000);
            defer split_pair.deinit(a);
            try std.testing.expect(try @import("text_site_edit.zig").splice(a, &split_pair.paragraphs[0].sites, 1, 0, 0, "L", 10000));
            var crossing_pair = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &split_pair, 0, 10000);
            defer crossing_pair.deinit(a);
            try std.testing.expectEqual(@as(usize, 4), crossing_pair.paragraphs[0].pieces.?.len);
            var extended_crossing = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &crossing_pair, 0, 10000);
            defer extended_crossing.deinit(a);
            try std.testing.expectEqual(@as(usize, 5), extended_crossing.paragraphs[0].pieces.?.len);
            try verifySaved(a, &tree, &extended_crossing, &.{"후AL😀BC"});
        }
        try std.testing.expectError(error.LimitExceeded, @import("paragraph_structure_merge.zig").prepare(a, &tree, &pair, 0, 1));
        var with_continuation = try @import("paragraph_structure_split.zig").prepare(a, &tree, &pair, first, 1, 1, 4, 10000);
        defer with_continuation.deinit(a);
        if (first == 0) {
            var continuation_extension = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &with_continuation, 1, 10000);
            defer continuation_extension.deinit(a);
            try verifySaved(a, &tree, &continuation_extension, &.{ "후", "A😀BC" });
        } else {
            var continuation_prepend = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &with_continuation, 0, 10000);
            defer continuation_prepend.deinit(a);
            try verifySaved(a, &tree, &continuation_prepend, &.{ "A😀후", "BC" });
            try std.testing.expectEqual(with_continuation.paragraphs[2].generated_id, continuation_prepend.paragraphs[1].generated_id);
            const baseline = try @import("paragraph_structure_save.zig").write(a, &tree, &with_continuation, .{}, &.{}, 10000);
            defer a.free(baseline);
            try std.testing.checkAllAllocationFailures(a, struct {
                fn unchanged(parsed: *const Tree, values: *const Values, expected: []const u8) !void {
                    const saved = try @import("paragraph_structure_save.zig").write(std.testing.allocator, parsed, values, .{}, &.{}, 10000);
                    defer std.testing.allocator.free(saved);
                    try std.testing.expectEqualSlices(u8, expected, saved);
                }
                fn run(allocator: std.mem.Allocator, parsed: *const Tree, values: *const Values, expected: []const u8) !void {
                    var result = @import("paragraph_structure_merge.zig").prepare(allocator, parsed, values, 0, 10000) catch |err| {
                        try unchanged(parsed, values, expected);
                        return err;
                    };
                    defer result.deinit(allocator);
                    try unchanged(parsed, values, expected);
                    try std.testing.expectEqual(values.paragraphs[2].generated_id, result.paragraphs[1].generated_id);
                    try verifySaved(allocator, parsed, &result, &.{ "A😀후", "BC" });
                }
            }.run, .{ &tree, &with_continuation, baseline });
        }
        try std.testing.expectEqual(@as(usize, 3), with_continuation.paragraphs.len);
        try std.testing.expectEqualStrings("후", with_continuation.paragraphs[first].sites.items[0].text);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const Values) !void {
                var result = try @import("paragraph_structure_merge.zig").prepare(allocator, parsed, source, 0, 10000);
                defer result.deinit(allocator);
                try std.testing.expectEqual(@as(usize, 3), result.paragraphs[0].pieces.?.len);
            }
        }.run, .{ &tree, &pair });
    }
    try std.testing.expectEqualStrings("A😀", original.paragraphs[0].sites.items[0].text);
}

test "joined column remerge preserves authority and crossing text through source pieces" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run></p:p><p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    var merged = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10000);
    defer merged.deinit(a);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &merged, 0, 1, 1, 3, 10000);
    defer split.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const Values) !void {
            var output = @import("paragraph_structure_merge.zig").prepare(allocator, parsed, source, 0, 10000) catch |err| {
                try expectOriginal(source);
                return err;
            };
            defer output.deinit(allocator);
            try expectOriginal(source);
            try std.testing.expectEqualStrings("A😀", output.paragraphs[0].sites.items[0].text);
            try std.testing.expectEqual(@as(u32, 3), output.paragraphs[0].column_boundaries.?[1].unit);
        }
    }.run, .{ &tree, &split });
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_structure_merge.zig").prepare(a, &tree, &split, 0, 1));
    try expectOriginal(&split);
    var crossing = try split.clone(a);
    defer crossing.deinit(a);
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &crossing.paragraphs[0].sites, 1, 0, 0, "L", 10000));
    var retained_output = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &crossing, 0, 10000);
    defer retained_output.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), retained_output.paragraphs[0].pieces.?.len);
    const retained_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &retained_output, .{}, &.{}, 10000);
    defer a.free(retained_xml);
    var reopened = try @import("xml_part_tree.zig").parse(a, retained_xml, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var reopened_sites = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer reopened_sites.deinit(a);
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    for (reopened_sites.items) |site| try text.appendSlice(a, site.text);
    try std.testing.expectEqualStrings("AL😀B", text.items);
    const reopened_locations = try @import("text_site_locations.zig").build(a, &reopened, &reopened_sites, .{});
    defer a.free(reopened_locations);
    const positions = try @import("anchor_text_positions.zig").build(a, &reopened, &reopened_sites, reopened_locations, 1);
    defer a.free(positions);
    const columns = try @import("column_boundary_collect.zig").collect(a, &reopened, 1, positions, .right, 2);
    defer a.free(columns);
    try std.testing.expectEqual(@as(usize, 2), columns.len);
    for (columns, retained_output.paragraphs[0].column_boundaries.?) |actual, expected| {
        try std.testing.expectEqual(expected.unit, actual.unit);
        try std.testing.expectEqualStrings(tree.sourceOf(expected.source_element), reopened.sourceOf(actual.source_element));
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const Values) !void {
            var candidate = try @import("paragraph_structure_merge.zig").prepare(allocator, parsed, source, 0, 10000);
            defer candidate.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 4), candidate.paragraphs[0].pieces.?.len);
            try std.testing.expectEqualStrings("L", source.paragraphs[0].sites.items[1].text);
        }
    }.run, .{ &tree, &crossing });
    try std.testing.expectEqualStrings("L", crossing.paragraphs[0].sites.items[1].text);
    try std.testing.expectEqualStrings("😀", crossing.paragraphs[1].sites.items[0].text);
    var three = try @import("paragraph_structure_split.zig").prepare(a, &tree, &crossing, 1, 2, 2, 4, 10000);
    defer three.deinit(a);
    var partial = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &three, 0, 10000);
    defer partial.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), partial.paragraphs[0].pieces.?.len);
    try std.testing.expectEqual(@as(usize, 2), partial.paragraphs[1].pieces.?.len);
    const partial_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &partial, .{}, &.{}, 10000);
    defer a.free(partial_xml);
    try verifySaved(a, &tree, &partial, &.{ "AL😀", "B" });
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const Values) !void {
            var candidate = @import("paragraph_structure_merge.zig").prepare(allocator, parsed, source, 0, 10000) catch |err| {
                try std.testing.expectEqualStrings("L", source.paragraphs[0].sites.items[1].text);
                try std.testing.expectEqual(@as(u32, 2), source.paragraphs[1].column_boundaries.?[0].unit);
                return err;
            };
            defer candidate.deinit(allocator);
            const output = @import("paragraph_structure_save.zig").write(allocator, parsed, &candidate, .{}, &.{}, 10000) catch |err| {
                try std.testing.expectEqualStrings("B", source.paragraphs[2].sites.items[1].text);
                return err;
            };
            defer allocator.free(output);
        }
    }.run, .{ &tree, &three });
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &three.paragraphs[1].sites, 1, 0, 0, "X", 10000));
    try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &tree, &three, 2, 0, 0, "R", 10000));
    var generated_merge = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &three, 1, 10000);
    defer generated_merge.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), generated_merge.paragraphs[1].pieces.?.len);
    for (generated_merge.paragraphs[1].pieces.?) |piece| try std.testing.expectEqual(generated_merge.paragraphs[1].generated_id, piece.generated_id);
    const generated_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &generated_merge, .{}, &.{}, 10000);
    defer a.free(generated_xml);
    try verifySaved(a, &tree, &generated_merge, &.{ "AL", "😀XRB" });
    var edited_partial = try partial.clone(a);
    defer edited_partial.deinit(a);
    try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &tree, &edited_partial, 0, 0, 0, "후", 10000));
    try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &tree, &edited_partial, 1, 0, 0, "끝", 10000));
    try verifySaved(a, &tree, &edited_partial, &.{ "후AL😀", "끝B" });
    var resplit_partial = try @import("paragraph_structure_split.zig").prepare(a, &tree, &edited_partial, 0, 2, 2, 5, 10000);
    defer resplit_partial.deinit(a);
    try verifySaved(a, &tree, &resplit_partial, &.{ "후A", "L😀", "끝B" });
    var rejoined_partial = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &resplit_partial, 0, 10000);
    defer rejoined_partial.deinit(a);
    try verifySaved(a, &tree, &rejoined_partial, &.{ "후AL😀", "끝B" });
    var final_joined = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &rejoined_partial, 0, 10000);
    defer final_joined.deinit(a);
    try verifySaved(a, &tree, &final_joined, &.{"후AL😀끝B"});
    const left_view = crossing.paragraphs[0].joined().?;
    const right_view = crossing.paragraphs[1].joined().?;
    const pieces = try a.alloc(@import("paragraph_joined_values.zig").Piece, 4);
    defer a.free(pieces);
    @memcpy(pieces[0..2], left_view.pieces);
    @memcpy(pieces[2..], right_view.pieces);
    for (pieces[2..]) |*piece| piece.first_site += 2;
    const rows = try a.alloc(@import("text_sites.zig").Site, 4);
    defer a.free(rows);
    @memcpy(rows[0..2], left_view.sites.items);
    @memcpy(rows[2..], right_view.sites.items);
    const retained: @import("paragraph_joined_values.zig").Joined = .{ .pieces = pieces, .sites = .{ .items = rows } };
    try @import("column_boundary_joined_provenance.zig").validate(&tree, &retained);
    pieces[2].owns_source = true;
    try std.testing.expectError(error.SourceBindingMismatch, @import("column_boundary_joined_provenance.zig").validate(&tree, &retained));
    pieces[2].owns_source = false;
    rows[2].start += 1;
    try std.testing.expectError(error.SourceBindingMismatch, @import("column_boundary_joined_provenance.zig").validate(&tree, &retained));
}
