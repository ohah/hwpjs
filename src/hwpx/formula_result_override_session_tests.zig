//! Flat native save gate; no public command or derived display claim.
const std = @import("std");
const editor = @import("editor_session.zig");

test "HWPX manual formula result saves all thirteen actual chart overrides in one native transaction" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var before = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer before.deinit();
    const section = &session.sections[0];
    const trees = [_]@import("xml_part_tree.zig").Tree{section.tree};
    var markers = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &markers);
    defer a.free(ranges);
    var expected: std.ArrayList(u8) = .empty;
    defer expected.deinit(a);
    var cursor: usize = 0;
    var count: usize = 0;
    for (ranges) |range| {
        const begin = markers.markers[range.begin_marker].element_index;
        if (!try @import("formula_source_query.zig").isFormula(a, &section.tree, begin)) continue;
        var selected: ?@import("text_sites.zig").Site = null;
        for (section.sites.items) |site| {
            if (site.start < range.content_start or site.end > range.content_end) continue;
            try std.testing.expect(selected == null);
            selected = site;
        }
        const site = selected orelse return error.TestExpectedEqual;
        try std.testing.expect(site.start >= cursor and !site.empty_element and !site.missing_text);
        try expected.appendSlice(a, section.tree.source[cursor..site.start]);
        try expected.appendSlice(a, "수동");
        cursor = site.end;
        try std.testing.expect(try section.formula_result_overrides.set(a, &section.tree, begin, "수동"));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 13), count);
    try expected.appendSlice(a, section.tree.source[cursor..]);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualSlices(u8, expected.items, reopened.sections[0].tree.source);
    const last = &section.formula_result_overrides.entries.items[count - 1];
    const original_begin = last.begin_element;
    last.begin_element = section.tree.elements.len;
    try std.testing.expectError(error.InvalidFormulaResultOverrideSelection, session.save());
    last.begin_element = section.formula_result_overrides.entries.items[0].begin_element;
    try std.testing.expectError(error.InvalidFormulaResultOverrideSelection, session.save());
    last.begin_element = original_begin;
    const recovered = try session.save();
    defer a.free(recovered);
    try std.testing.expectEqualSlices(u8, saved, recovered);
    try before.exchange(&session);
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try before.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "HWPX manual formula result preserves unrelated stale body in actual copay reference" {
    try @import("../testing/checked_allocator.zig").run(preserveActualCopayBody, .{});
}

fn preserveActualCopayBody(a: std.mem.Allocator) !void {
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx", a, .limited(4_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const trees = [_]@import("xml_part_tree.zig").Tree{section.tree};
    var markers = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &markers);
    defer a.free(ranges);
    var ordinal: usize = 0;
    for (ranges) |range| {
        const begin = markers.markers[range.begin_marker].element_index;
        if (!try @import("formula_source_query.zig").isFormula(a, &section.tree, begin)) continue;
        ordinal += 1;
        if (ordinal != 2) continue;
        var selected: ?@import("text_sites.zig").Site = null;
        for (section.sites.items) |site| {
            if (site.start < range.content_start or site.end > range.content_end) continue;
            try std.testing.expect(selected == null);
            selected = site;
        }
        const site = selected orelse return error.TestExpectedEqual;
        const expected = try std.mem.concat(a, u8, &.{ section.tree.source[0..site.start], "수동 결과", section.tree.source[site.end..] });
        defer a.free(expected);
        try std.testing.expect(try section.formula_result_overrides.set(a, &section.tree, begin, "수동 결과"));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        try std.testing.expectEqualSlices(u8, expected, reopened.sections[0].tree.source);
        return;
    }
    return error.TestExpectedEqual;
}

test "HWPX manual formula result native ZIP save preserves caches and checkpoint byte history" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const begin = for (section.tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    var before = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer before.deinit();
    try std.testing.expect(try section.formula_result_overrides.set(a, &section.tree, begin, "수동😀<&"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualStrings("수동😀<&", reopened.sections[0].sites.items[1].text);
    var query = try @import("formula_source_query.zig").read(a, &reopened.sections[0].tree, begin);
    defer query.deinit();
    try std.testing.expectEqualStrings("=SUM(A1:A1)", query.values.formula.?);
    try std.testing.expectEqualStrings("=SUM(A1:A1)??%g,;;2", query.values.command.?);
    try std.testing.expectEqualStrings("2", query.values.last_result.?);
    try std.testing.expect(try section.formula_definitions.set(a, &section.tree, begin, "=AVG(A1:A1)"));
    const definition_saved = try session.save();
    defer a.free(definition_saved);
    var definition_reopened = try editor.open(a, definition_saved, .{});
    defer definition_reopened.deinit();
    var definition_query = try @import("formula_source_query.zig").read(a, &definition_reopened.sections[0].tree, begin);
    defer definition_query.deinit();
    try std.testing.expectEqualStrings("=AVG(A1:A1)", definition_query.values.formula.?);
    try std.testing.expectEqualStrings("2", definition_query.values.last_result.?);
    try std.testing.expectEqualStrings("수동😀<&", definition_reopened.sections[0].sites.items[1].text);
    try std.testing.expectEqualStrings("수동😀<&", section.formula_result_overrides.get(begin).?);
    try std.testing.expect(try section.formula_definitions.set(a, &section.tree, begin, "=SUM(A1:A1)"));
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, saved, resaved);
    try before.exchange(&session);
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try before.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, expected: []const u8, node: usize) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            defer std.testing.expectEqualStrings("수동😀<&", source.sections[0].formula_result_overrides.get(node).?) catch @panic("override mutated");
            const bytes = try proxy.save();
            defer allocator.free(bytes);
            try std.testing.expectEqualSlices(u8, expected, bytes);
        }
    }.run, .{ &session, saved, begin });
    try std.testing.expectEqualSlices(u8, input, session.source);
}
