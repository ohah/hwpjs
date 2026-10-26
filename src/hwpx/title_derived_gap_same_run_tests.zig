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

fn sameRun(a: std.mem.Allocator) !void {
    const xml = head ++ "<p:run charPrIDRef='1'><p:t>BC<p:titleMark ignore='1'/></p:t><p:t>DE<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    // This single run really fragments because only B changes style. The second
    // text's DE span now carries a genuine canonical implicit trailing gap1.
    _ = try current.setCharacterFormat(0, 1, 0, 1, 2);
    const initial = &current.sections[0].structure_values.?.paragraphs[0];
    const owners = initial.title_fragment_owners.?;
    try std.testing.expectEqual(@as(usize, 2), owners.len);
    const second_marker = owners[1].element_index;
    const tree = &current.sections[0].tree;
    try std.testing.expectEqualStrings(tree.sourceOf(owners[0].element_index), tree.sourceOf(second_marker));
    try std.testing.expectEqual(tree.elements[owners[0].text_element].parent.?, tree.elements[owners[1].text_element].parent.?);
    try std.testing.expect(owners[0].text_element != owners[1].text_element);
    var genuine: usize = 0;
    var old_carrier: ?usize = null;
    for (initial.title_output_projection.?.derived_gaps) |gap| {
        if (gap.marker_element != second_marker) continue;
        try std.testing.expect(!gap.materialized);
        try std.testing.expectEqual(@as(?u32, 1), gap.char_shape_id);
        old_carrier = gap.carrier_fragment;
        try std.testing.expect(old_carrier != null);
        genuine += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), genuine);
    const commands = [_]struct { start: u32, id: u32 }{
        .{ .start = 2, .id = 2 }, // Split DE carrier into D2/E1; owner E stays1.
        .{ .start = 3, .id = 2 },
        .{ .start = 3, .id = 1 },
    };
    for (commands, 0..) |command, step| {
        const saved = try current.save();
        defer a.free(saved);
        var branch = try editor.open(a, saved, .{});
        defer branch.deinit();
        var before = try current.sections[0].structure_values.?.paragraphs[0].clone(a);
        defer before.deinit(a);
        _ = current.setCharacterFormat(0, 1, command.start, command.start + 1, command.id) catch |err| {
            try sameState(&before, &current.sections[0].structure_values.?.paragraphs[0]);
            try std.testing.expectEqualSlices(u8, bytes, current.source);
            return err;
        };
        _ = try branch.setCharacterFormat(0, 1, command.start, command.start + 1, command.id);
        const row = &current.sections[0].structure_values.?.paragraphs[0];
        if (step == 0) {
            // Style-based change detection alone cannot identify this split.
            try std.testing.expectEqual(@as(?u32, 1), row.title_fragment_owners.?[1].char_shape_id);
            var preserved: usize = 0;
            var latent: usize = 0;
            for (row.title_output_projection.?.derived_gaps) |gap| {
                if (gap.marker_element != second_marker) continue;
                try std.testing.expectEqual(@as(?u32, 1), gap.char_shape_id);
                if (gap.materialized) {
                    try std.testing.expectEqual(old_carrier, gap.carrier_fragment);
                    preserved += 1;
                } else {
                    try std.testing.expect(gap.carrier_fragment != null);
                    latent += 1;
                }
            }
            try std.testing.expectEqual(@as(usize, 1), preserved);
            try std.testing.expectEqual(@as(usize, 1), latent);
        }
        compare(a, &current, &branch) catch |err| {
            if (err != error.OutOfMemory) std.debug.print("same-run step={d} start={d} id={d}\n", .{ step, command.start, command.id });
            return err;
        };
        if (step == 0) {
            const result_bytes = try current.save();
            defer a.free(result_bytes);
            var result = try editor.open(a, result_bytes, .{});
            defer result.deinit();
            // Source+commands: original second zero1 AND formerly implicit gap1
            // must survive as two distinct old-style empty siblings after E1.
            const expected = head ++ "<p:run charPrIDRef='2'><p:t>B</p:t></p:run><p:run charPrIDRef='1'><p:t>C<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run><p:run charPrIDRef='2'><p:t>D</p:t></p:run><p:run charPrIDRef='1'><p:t>E<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run></p:p></s:sec>";
            try std.testing.expectEqualStrings(expected, result.sections[0].tree.source);
        }
    }
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}
test "derived same source run two texts unchanged marker style carrier split exact parity" {
    try sameRun(std.testing.allocator);
}
test "derived same source run carrier split chain OOM retains both marker histories" {
    try @import("../testing/allocation_failures.zig").check(sameRun, .{});
}

test "derived carrier missing or foreign identity rejects before any gap mutation" {
    const a = std.testing.allocator;
    const xml = head ++ "<p:run charPrIDRef='1'><p:t>BC<p:titleMark ignore='1'/></p:t><p:t>DE<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    _ = try session.setCharacterFormat(0, 1, 0, 1, 2);
    const row = &session.sections[0].structure_values.?.paragraphs[0];
    const painted = try @import("character_style_paint.zig").prepare(a, &row.sites, row.character_styles.?, 2, 3, 2, &.{ 1, 2 }, session.options.max_sites);
    defer a.free(painted);
    for ([_]?usize{ null, std.math.maxInt(usize) }) |forged_id| {
        var forged = try row.clone(a);
        defer forged.deinit(a);
        const plan = &forged.title_output_projection.?;
        try std.testing.expect(plan.derived_gaps.len != 0);
        plan.derived_gaps[0].carrier_fragment = forged_id;
        // Even an otherwise consistent checksum is not source/carrier proof.
        plan.derived_gap_digest = @import("title_derived_gap.zig").digest(plan.derived_gaps);
        var before = try forged.clone(a);
        defer before.deinit(a);
        try std.testing.expectError(error.SourceBindingMismatch, @import("title_derived_gap.zig").prepareFormat(&session.sections[0].tree, &forged, painted));
        try sameState(&before, &forged);
    }
    try row.title_output_projection.?.validate(row);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
