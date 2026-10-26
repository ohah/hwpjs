//! Artifact-only actual Session controls. UNCOMPILED; do not replace old hostile controls.
const std = @import("std");
const editor = @import("editor_session.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";
fn input(a: std.mem.Allocator) ![]u8 {
    const xml = head ++ "<p:run charPrIDRef='1'><p:t>BC<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
}
fn sameState(before: *const Paragraph, after: *const Paragraph) !void {
    try std.testing.expectEqualDeep(before.sites.items, after.sites.items);
    try std.testing.expectEqualDeep(before.character_styles, after.character_styles);
    try std.testing.expectEqualDeep(before.title_fragment_owners, after.title_fragment_owners);
    try std.testing.expectEqualDeep(before.title_positions, after.title_positions);
    // Includes derived gap content, explicit/virtual distinction, digest and options.
    try std.testing.expectEqualDeep(before.title_output_projection, after.title_output_projection);
    if (after.title_output_projection) |*plan| try plan.validate(after);
}
fn compare(a: std.mem.Allocator, left: *editor.Session, right: *editor.Session) !void {
    const one = try left.save();
    defer a.free(one);
    const two = try right.save();
    defer a.free(two);
    var saved_one = try editor.open(a, one, .{});
    defer saved_one.deinit();
    var saved_two = try editor.open(a, two, .{});
    defer saved_two.deinit();
    try std.testing.expectEqualStrings(saved_one.sections[0].tree.source, saved_two.sections[0].tree.source);
    try std.testing.expectEqualSlices(u8, one, two);
    const ranges_one = try @import("character_style_snapshot.zig").read(left, 0, 1);
    defer a.free(ranges_one);
    const ranges_two = try @import("character_style_snapshot.zig").read(right, 0, 1);
    defer a.free(ranges_two);
    try std.testing.expectEqualDeep(ranges_one, ranges_two);
}

fn assertGaps(row: *const Paragraph, marker: usize, expected: []const u32) !void {
    const plan = row.title_output_projection orelse return error.MissingPlan;
    try plan.validate(row);
    var count: usize = 0;
    for (plan.derived_gaps) |gap| {
        if (gap.marker_element != marker) continue;
        if (count >= expected.len) return error.ExtraMarkerGap;
        try std.testing.expectEqual(@as(?u32, expected[count]), gap.char_shape_id);
        try std.testing.expectEqual(count != 0, gap.materialized);
        count += 1;
    }
    try std.testing.expectEqual(expected.len, count);
}
test "derived identical raw markers keep independent source ordered histories through clone" {
    const a = std.testing.allocator;
    const xml = head ++ "<p:run charPrIDRef='1'><p:t>BC<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t>DE<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    _ = try current.setCharacterFormat(0, 1, 0, 1, 2);
    const initial = &current.sections[0].structure_values.?.paragraphs[0];
    const owners = initial.title_fragment_owners.?;
    try std.testing.expectEqual(@as(usize, 2), owners.len);
    const first = owners[0].element_index;
    const second = owners[1].element_index;
    const tree = &current.sections[0].tree;
    try std.testing.expect(tree.elements[first].start_tag.start < tree.elements[second].start_tag.start);
    try std.testing.expectEqualStrings(tree.sourceOf(first), tree.sourceOf(second));
    try std.testing.expect(owners[0].text_element != owners[1].text_element);
    const commands = [_]struct { start: u32, id: u32 }{
        .{ .start = 3, .id = 2 }, // E first; C's owner/gap must not follow E.
        .{ .start = 1, .id = 2 }, // C next; both marker styles now match.
        .{ .start = 3, .id = 1 }, // Restore E; equal old IDs must remain distinct.
    };
    for (commands, 0..) |command, step| {
        const saved = try current.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        var clone = try current.sections[0].structure_values.?.paragraphs[0].clone(a);
        defer clone.deinit(a);
        const prior_digest = clone.title_output_projection.?.derived_gap_digest;
        try std.testing.expect(clone.title_output_projection.?.derived_gaps.ptr != current.sections[0].structure_values.?.paragraphs[0].title_output_projection.?.derived_gaps.ptr);
        _ = try current.setCharacterFormat(0, 1, command.start, command.start + 1, command.id);
        _ = try reopened.setCharacterFormat(0, 1, command.start, command.start + 1, command.id);
        compare(a, &current, &reopened) catch |err| {
            if (err != error.OutOfMemory) std.debug.print("multi-marker step={d} start={d} id={d}\n", .{ step, command.start, command.id });
            return err;
        };
        try clone.title_output_projection.?.validate(&clone);
        try std.testing.expectEqual(prior_digest, clone.title_output_projection.?.derived_gap_digest);
        try assertGaps(&clone, first, if (step < 2) &.{1} else &.{ 2, 1 });
        try assertGaps(&clone, second, if (step == 0) &.{} else &.{2});
        const row = &current.sections[0].structure_values.?.paragraphs[0];
        try assertGaps(row, first, if (step == 0) &.{1} else &.{ 2, 1 });
        try assertGaps(row, second, if (step == 2) &.{ 1, 2 } else &.{2});
        const now = row.title_fragment_owners.?;
        try std.testing.expectEqual(first, now[0].element_index);
        try std.testing.expectEqual(second, now[1].element_index);
        try std.testing.expectEqual(@as(?u32, if (step == 0) 1 else 2), now[0].char_shape_id);
        try std.testing.expectEqual(@as(?u32, if (step == 2) 1 else 2), now[1].char_shape_id);
        var seen_second = false;
        for (row.title_output_projection.?.derived_gaps) |gap| {
            if (gap.marker_element == second) seen_second = true;
            if (gap.marker_element == first) try std.testing.expect(!seen_second);
            try std.testing.expect(gap.marker_element == first or gap.marker_element == second);
            try std.testing.expectEqual(tree.elements[gap.marker_element].parent.?, gap.text_element);
            try std.testing.expectEqual(tree.elements[gap.text_element].parent.?, gap.run_element);
        }
    }
    const saved = try current.save();
    defer a.free(saved);
    var final = try editor.open(a, saved, .{});
    defer final.deinit();
    // Source + commands, not the saved output, defines both independent marker histories.
    const expected = head ++ "<p:run charPrIDRef='2'><p:t>B</p:t></p:run><p:run charPrIDRef='2'><p:t>C<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run><p:run charPrIDRef='1'><p:t>D</p:t></p:run><p:run charPrIDRef='1'><p:t>E<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='2'><p:t></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, final.sections[0].tree.source);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}

test "derived zero marker paragraph edit preserves unrelated title paragraph plan" {
    const a = std.testing.allocator;
    const xml = head ++ "<p:run charPrIDRef='1'><p:t>UV</p:t></p:run></p:p><p:p><p:run charPrIDRef='1'><p:t>BC<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    _ = try current.setCharacterFormat(0, 2, 0, 1, 2);
    var untouched = try current.sections[0].structure_values.?.paragraphs[1].clone(a);
    defer untouched.deinit(a);
    _ = try current.setCharacterFormat(0, 1, 0, 1, 2);
    const rows = current.sections[0].structure_values.?.paragraphs;
    try std.testing.expect(rows[0].title_fragment_owners == null);
    try std.testing.expect(rows[0].title_output_projection == null);
    try sameState(&untouched, &rows[1]);
    const saved = try current.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const expected = head ++ "<p:run charPrIDRef='2'><p:t>U</p:t></p:run><p:run charPrIDRef='1'><p:t>V</p:t></p:run></p:p><p:p><p:run charPrIDRef='2'><p:t>B</p:t></p:run><p:run charPrIDRef='1'><p:t>C<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, reopened.sections[0].tree.source);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}
