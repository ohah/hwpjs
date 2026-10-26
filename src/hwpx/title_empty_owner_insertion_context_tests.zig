//! Fresh real Session tests; no injected Sites/Span/Owner arrays.
const std = @import("std");
const editor = @import("editor_session.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'>";
const tail = "</p:run></p:p></s:sec>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";
fn openInput(a: std.mem.Allocator, is_leading: bool) ![]u8 {
    const xml = try std.mem.concat(a, u8, &.{ head, if (is_leading) "<p:t><p:titleMark ignore='1'/>BC</p:t>" else "<p:t>BC<p:titleMark ignore='1'/></p:t>", tail });
    defer a.free(xml);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
}
fn equalState(before: *const Paragraph, after: *const Paragraph) !void {
    try std.testing.expectEqualDeep(before.sites.items, after.sites.items);
    try std.testing.expectEqualDeep(before.character_styles, after.character_styles);
    try std.testing.expectEqualDeep(before.title_fragment_owners, after.title_fragment_owners);
    try std.testing.expectEqualDeep(before.title_positions, after.title_positions);
    // Includes optional presence, ranges, options, budget, signature and template.
    try std.testing.expectEqualDeep(before.title_output_projection, after.title_output_projection);
    if (before.title_output_projection) |*plan| try plan.validate(before);
    if (after.title_output_projection) |*plan| try plan.validate(after);
}
fn owner(s: *const editor.Session) !u32 {
    const owners = s.sections[0].structure_values.?.paragraphs[0].title_fragment_owners.?;
    try std.testing.expectEqual(@as(usize, 1), owners.len);
    return owners[0].char_shape_id orelse error.MissingOwnerStyle;
}
fn leading(a: std.mem.Allocator) !void {
    const bytes = try openInput(a, true);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    _ = try s.setCharacterFormat(0, 1, 0, 1, 2);
    var before_insert = try s.sections[0].structure_values.?.paragraphs[0].clone(a);
    defer before_insert.deinit(a);
    _ = s.splice(0, 1, 0, 0, "Y") catch |err| {
        try equalState(&before_insert, &s.sections[0].structure_values.?.paragraphs[0]);
        try std.testing.expectEqualSlices(u8, bytes, s.source);
        return err;
    };
    var before_format = try s.sections[0].structure_values.?.paragraphs[0].clone(a);
    defer before_format.deinit(a);
    _ = s.setCharacterFormat(0, 1, 0, 1, 2) catch |err| {
        try equalState(&before_format, &s.sections[0].structure_values.?.paragraphs[0]);
        try std.testing.expectEqualSlices(u8, bytes, s.source);
        return err;
    };
    try std.testing.expectEqual(@as(u32, 2), try owner(&s));
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const tree = &reopened.sections[0].tree;
    var count: usize = 0;
    for (tree.elements) |element| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "titleMark")) continue;
        const run = tree.elements[element.parent.?].parent.?;
        try std.testing.expectEqual(@as(?u32, 2), try @import("character_style_projection.zig").runId(a, tree, run));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expectEqualSlices(u8, bytes, s.source);
}
fn neighbor(a: std.mem.Allocator) !void {
    const bytes = try openInput(a, false);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    _ = try s.setCharacterFormat(0, 1, 0, 1, 2);
    _ = try s.splice(0, 1, 1, 1, "");
    var before = try s.sections[0].structure_values.?.paragraphs[0].clone(a);
    defer before.deinit(a);
    _ = s.splice(0, 1, 1, 0, "Y") catch |err| {
        try equalState(&before, &s.sections[0].structure_values.?.paragraphs[0]);
        return err;
    };
    try std.testing.expectEqual(@as(u32, 1), try owner(&s));
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, s.source);
}
test "empty owner true insertion then reformat actual Session updates owner" {
    try leading(std.testing.allocator);
}
test "deleted owner not stolen by neighboring insertion actual Session" {
    try neighbor(std.testing.allocator);
}
test "empty owner insertion reformat OOM keeps candidate and source atomic" {
    try @import("../testing/allocation_failures.zig").check(leading, .{});
}
test "neighbor insertion freeze OOM keeps candidate and source atomic" {
    try @import("../testing/allocation_failures.zig").check(neighbor, .{});
}

// Append-only proposals for the frozen title_empty_owner_insertion_context_tests.zig.
// Uses its openInput/equalState helpers. No test was compiled or run here.
test "title output Plan clone owns independent numeric ranges" {
    const a = std.testing.allocator;
    const bytes = try openInput(a, true);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    _ = try s.setCharacterFormat(0, 1, 0, 1, 2);
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    var copy = try row.clone(a);
    defer copy.deinit(a);
    try equalState(row, &copy);
    try std.testing.expect(copy.title_output_projection.?.ranges.len != 0);
    try std.testing.expect(copy.title_output_projection.?.ranges.ptr != row.title_output_projection.?.ranges.ptr);
    const original = row.title_output_projection.?.ranges[0];
    copy.title_output_projection.?.ranges[0].char_shape_id = if (original.char_shape_id == 1) 2 else 1;
    try std.testing.expectEqualDeep(original, row.title_output_projection.?.ranges[0]);
}

test "title output Plan rejects changed source binding style and owner interval" {
    const a = std.testing.allocator;
    const bytes = try openInput(a, true);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    _ = try s.setCharacterFormat(0, 1, 0, 1, 2);
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    for (0..4) |which| {
        var bad = try row.clone(a);
        defer bad.deinit(a);
        switch (which) {
            0 => bad.sites.items[0].start += 1,
            1 => bad.character_styles.?[0].char_shape_id = 2,
            2 => bad.title_fragment_owners.?[0].end_unit += 1,
            3 => bad.template_element += 1,
            else => unreachable,
        }
        try std.testing.expectError(error.SourceBindingMismatch, bad.title_output_projection.?.validate(&bad));
    }
    try row.title_output_projection.?.validate(row);
}

test "empty insertion forged span rejected missing context conservative and missing tree refused" {
    const a = std.testing.allocator;
    const bytes = try openInput(a, true);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    _ = try s.setCharacterFormat(0, 1, 0, 1, 2);
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    var before = try row.clone(a);
    defer before.deinit(a);
    const owners = row.title_fragment_owners.?;
    try std.testing.expectEqual(@as(usize, 1), owners.len);
    const selected = for (row.character_styles.?) |span| {
        if (span.start_unit == 0 and span.end_unit == 0 and span.tab_element == null and span.anchor_element == null) break span;
    } else return error.MissingEmptyTarget;
    const module = @import("title_fragment_owner.zig");
    const context: module.Insertion = .{ .tree = &s.sections[0].tree, .paragraph = row, .span = selected };
    const grown = try module.spliceAtInsertion(a, owners, 0, 0, 1, context);
    defer a.free(grown);
    try std.testing.expectEqual(@as(usize, 0), grown[0].start_unit);
    try std.testing.expectEqual(@as(usize, 1), grown[0].end_unit);
    var forged = context;
    forged.span.site_index = std.math.maxInt(usize);
    try std.testing.expectError(error.SourceBindingMismatch, module.spliceAtInsertion(a, owners, 0, 0, 1, forged));
    forged = context;
    forged.span.char_shape_id = 2; // different from the genuine old-style empty span
    try std.testing.expectError(error.SourceBindingMismatch, module.spliceAtInsertion(a, owners, 0, 0, 1, forged));
    // Legacy missing context must never invent new ownership or claim expansion.
    const conservative = try module.spliceAtInsertion(a, owners, 0, 0, 1, null);
    defer a.free(conservative);
    try std.testing.expectEqual(@as(usize, 1), conservative[0].start_unit);
    try std.testing.expectEqual(@as(usize, 1), conservative[0].end_unit);
    const locations = try @import("paragraph_structure_locations.zig").build(a, &s.sections[0].tree, row);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").buildForFieldText(a, &s.sections[0].tree, &row.sites, locations, 1);
    defer a.free(positions);
    // A real paragraph carrying a Plan cannot use the legacy tree-less caller.
    try std.testing.expectError(error.SourceBindingMismatch, @import("character_style_splice.zig").splicePositionsAtSite(a, row, positions, 0, 0, "Y", 10000, selected.site_index));
    try equalState(&before, row);
    try std.testing.expectEqualSlices(u8, bytes, s.source);
}
