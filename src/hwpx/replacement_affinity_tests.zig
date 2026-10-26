const std = @import("std");
const fixture = @import("test_replacement_affinity_fixture.zig");
const a = std.testing.allocator;
fn exercise(current: bool, styled: bool) !void {
    const input = try fixture.formulaInput(a);
    defer a.free(input);
    var s = try @import("editor_session.zig").open(a, input, .{});
    defer s.deinit();
    if (current) try fixture.materialize(&s, styled);
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&s, 0, 2, 2, 3));
    try std.testing.expect(try s.splice(0, 2, 2, 1, "Y"));
    try fixture.assertSaved(&s, "Y");
}
test "replacement affinity source formula wrapper preserves field" {
    try exercise(false, false);
}
test "replacement affinity current formula preserves field" {
    try exercise(true, false);
}
test "replacement affinity styled current formula preserves field" {
    try exercise(true, true);
}
test "replacement affinity validated styled field consumer uses explicit owner" {
    const input = try fixture.formulaInput(a);
    defer a.free(input);
    var s = try @import("editor_session.zig").open(a, input, .{});
    defer s.deinit();
    try fixture.materialize(&s, true);
    const row = &s.sections[0].structure_values.?.paragraphs[1];
    const locations = try @import("paragraph_structure_locations.zig").build(a, &s.sections[0].tree, row);
    defer a.free(locations);
    const positions = try @import("anchor_text_positions.zig").buildForFieldText(a, &s.sections[0].tree, &row.sites, locations, 1);
    defer a.free(positions);
    try std.testing.expect(try @import("character_style_splice.zig").splicePositionsAtSite(a, row, positions, 2, 1, "Y", 4096, @import("text_splice_transaction.zig").replacementInsertionSite(&row.sites, positions, 2, 1).?));
    try std.testing.expectEqualStrings("2", row.sites.items[1].text);
    try std.testing.expectEqualStrings("Y", row.sites.items[2].text);
    try fixture.assertSaved(&s, "Y");
}

test "replacement affinity generic styled anchored retains left contract" {
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:t>X</p:t><p:t>A</p:t><p:t>Z</p:t></p:run></p:p>");
    defer a.free(input);
    var s = try @import("editor_session.zig").open(a, input, .{});
    defer s.deinit();
    try fixture.materialize(&s, false);
    const row = &s.sections[0].structure_values.?.paragraphs[0];
    const locations = try @import("paragraph_structure_locations.zig").build(a, &s.sections[0].tree, row);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, &s.sections[0].tree, &row.sites, locations, 1);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &s.sections[0].tree, &row.sites, positions, 100);
    defer a.free(projection);
    row.character_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    try std.testing.expect(try @import("character_style_splice.zig").spliceAnchored(a, &s.sections[0].tree, row, 2, 1, "Y", 4096));
    try std.testing.expectEqualStrings("AY", row.sites.items[1].text);
    try std.testing.expectEqualStrings("", row.sites.items[2].text);
}
test "replacement affinity source formula protected boundary and noop preserve bytes" {
    const input = try fixture.formulaInput(a);
    defer a.free(input);
    var s = try @import("editor_session.zig").open(a, input, .{});
    defer s.deinit();
    try std.testing.expectError(error.ProtectedFieldRange, s.splice(0, 2, 2, 0, "NO"));
    try std.testing.expect(!try s.splice(0, 2, 2, 1, "Z"));
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
test "replacement affinity styled allocation failures preserve text and style" {
    const input = try fixture.formulaInput(a);
    defer a.free(input);
    var s = try @import("editor_session.zig").open(a, input, .{});
    defer s.deinit();
    try fixture.materialize(&s, true);
    const row = &s.sections[0].structure_values.?.paragraphs[1];
    const locations = try @import("paragraph_structure_locations.zig").build(a, &s.sections[0].tree, row);
    defer a.free(locations);
    const positions = try @import("anchor_text_positions.zig").buildForFieldText(a, &s.sections[0].tree, &row.sites, locations, 1);
    defer a.free(positions);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("paragraph_structure_values.zig").Paragraph, segments: []const @import("paragraph_text_positions.zig").Segment) !void {
            var copy = try original.clone(allocator);
            defer copy.deinit(allocator);
            _ = @import("character_style_splice.zig").splicePositionsAtSite(allocator, &copy, segments, 2, 1, "Y", 4096, @import("text_splice_transaction.zig").replacementInsertionSite(&copy.sites, segments, 2, 1).?) catch |err| {
                for (original.sites.items, copy.sites.items) |old, now| try std.testing.expectEqualStrings(old.text, now.text);
                try std.testing.expectEqualSlices(@import("character_style_paint.zig").Span, original.character_styles.?, copy.character_styles.?);
                return err;
            };
            try std.testing.expectEqualStrings("2", copy.sites.items[1].text);
            try std.testing.expectEqualStrings("Y", copy.sites.items[2].text);
        }
    }.run, .{ row, positions });
}

test "replacement affinity multirun styles insertion replacement explicit and noop" {
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>X</p:t></p:run><p:run charPrIDRef='8'><p:t>A</p:t></p:run><p:run charPrIDRef='9'><p:t>Z</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const sites = try @import("text_sites.zig").collect(a, &tree, .{});
    var row: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = sites };
    defer row.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &row.sites, .{});
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, &tree, &row.sites, locations, 1);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &tree, &row.sites, positions, 100);
    defer a.free(projection);
    row.character_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    for (0..4) |mode| {
        var copy = try row.clone(a);
        defer copy.deinit(a);
        const splice = @import("character_style_splice.zig");
        if (mode == 0) {
            try std.testing.expect(try splice.splicePositions(a, &copy, positions, 2, 1, "Y", 4096));
            try std.testing.expectEqualStrings("AY", copy.sites.items[1].text);
            try std.testing.expectEqualStrings("", copy.sites.items[2].text);
        } else if (mode == 1) {
            try std.testing.expect(try splice.splicePositions(a, &copy, positions, 2, 0, "Y", 4096));
            try std.testing.expectEqualStrings("AY", copy.sites.items[1].text);
            try std.testing.expectEqualStrings("Z", copy.sites.items[2].text);
        } else if (mode == 2) {
            try std.testing.expect(try splice.splicePositionsAtSite(a, &copy, positions, 2, 1, "Y", 4096, 1));
            try std.testing.expectEqualStrings("AY", copy.sites.items[1].text);
            try std.testing.expectEqualStrings("", copy.sites.items[2].text);
        } else {
            try std.testing.expect(!try splice.splicePositions(a, &copy, positions, 2, 1, "Z", 4096));
            try std.testing.expectEqualSlices(@import("character_style_paint.zig").Span, row.character_styles.?, copy.character_styles.?);
        }
        for (copy.character_styles.?) |span| try std.testing.expectEqual(@as(?u32, @intCast(7 + span.site_index)), span.char_shape_id);
    }
}
test "replacement affinity explicit label boundary retains owned insertion and dirty" {
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>Z</p:t></p:run></p:p></s:sec>");
    defer a.free(input);
    var s = try @import("editor_session.zig").open(a, input, .{});
    defer s.deinit();
    const labels = try s.fieldLabels(0, 1);
    defer a.free(labels);
    try std.testing.expect(try s.spliceFieldLabel(0, 1, labels[0].begin_element, 2, 0, "L"));
    try std.testing.expectEqual(@as(usize, 1), s.sections[0].field_dirty.items.len);
    try std.testing.expect(s.sections[0].field_dirty.items[0].dirty);
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualStrings("AL", reopened.sections[0].sites.items[1].text);
    try std.testing.expectEqualStrings("Z", reopened.sections[0].sites.items[2].text);
    const after = try reopened.fieldLabels(0, 1);
    defer a.free(after);
    try std.testing.expectEqual(@as(usize, 3), after[0].end);
}

test "replacement affinity explicit current field positions retain suffix owner" {
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>Z</p:t></p:run></p:p></s:sec>");
    defer a.free(input);
    var s = try @import("editor_session.zig").open(a, input, .{});
    defer s.deinit();
    try std.testing.expect(try s.splitParagraph(0, 1, 0, 0));
    try std.testing.expect(s.sections[0].structure_values.?.paragraphs[1].field_positions != null);
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&s, 0, 2, 2, 3));
    try std.testing.expect(try s.splice(0, 2, 2, 1, "Y"));
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const labels = try reopened.fieldLabels(0, 2);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 2), labels[0].end);
    const sites = reopened.sections[0].sites.items;
    try std.testing.expectEqualStrings("Y", sites[sites.len - 1].text);
}
test "replacement affinity inherited table continuation retains suffix owner" {
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>outside</p:t></p:run></p:p><p:p><p:run><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:tbl/><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>Z</p:t></p:run></p:p></s:sec>");
    defer a.free(input);
    var s = try @import("editor_session.zig").open(a, input, .{});
    defer s.deinit();
    try fixture.materialize(&s, false);
    const labels = try s.fieldLabels(0, 2);
    defer a.free(labels);
    const end: u32 = @intCast(labels[0].end);
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&s, 0, 2, end, end + 1));
    try std.testing.expect(try s.splice(0, 2, end, 1, "Y"));
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const after = try reopened.fieldLabels(0, 2);
    defer a.free(after);
    try std.testing.expectEqual(labels[0].end, after[0].end);
    const sites = reopened.sections[0].sites.items;
    try std.testing.expectEqualStrings("Y", sites[sites.len - 1].text);
}
