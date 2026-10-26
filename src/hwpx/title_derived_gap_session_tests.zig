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
    try std.testing.expectEqualSlices(u8, one, two);
    var saved_one = try editor.open(a, one, .{});
    defer saved_one.deinit();
    var saved_two = try editor.open(a, two, .{});
    defer saved_two.deinit();
    try std.testing.expectEqualStrings(saved_one.sections[0].tree.source, saved_two.sections[0].tree.source);
    const ranges_one = try @import("character_style_snapshot.zig").read(left, 0, 1);
    defer a.free(ranges_one);
    const ranges_two = try @import("character_style_snapshot.zig").read(right, 0, 1);
    defer a.free(ranges_two);
    try std.testing.expectEqualDeep(ranges_one, ranges_two);
}
fn run(a: std.mem.Allocator) !void {
    const bytes = try input(a);
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 0, 1, 2));
    const first = try current.save();
    defer a.free(first);
    var reopened = try editor.open(a, first, .{});
    defer reopened.deinit();
    // Preserve the canonical gap independently of original explicit zero.
    var before = try current.sections[0].structure_values.?.paragraphs[0].clone(a);
    defer before.deinit(a);
    _ = current.setCharacterFormat(0, 1, 1, 2, 2) catch |err| {
        try sameState(&before, &current.sections[0].structure_values.?.paragraphs[0]);
        try std.testing.expectEqualSlices(u8, bytes, current.source);
        return err;
    };
    _ = try reopened.setCharacterFormat(0, 1, 1, 2, 2);
    try compare(a, &current, &reopened);
    const second = try current.save();
    defer a.free(second);
    var second_saved = try editor.open(a, second, .{});
    defer second_saved.deinit();
    // Source + B2 then C2 commands determine this DOM; no output used as expectation.
    const expected = head ++ "<p:run charPrIDRef='2'><p:t>B</p:t></p:run><p:run charPrIDRef='2'><p:t>C<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, second_saved.sections[0].tree.source);
    // Two style flips retain each canonical empty sibling in order, including equal IDs.
    for ([_]u32{ 1, 2 }) |id| {
        const saved = try current.save();
        defer a.free(saved);
        var branch = try editor.open(a, saved, .{});
        defer branch.deinit();
        var checkpoint = try current.sections[0].structure_values.?.paragraphs[0].clone(a);
        defer checkpoint.deinit(a);
        _ = current.setCharacterFormat(0, 1, 1, 2, id) catch |err| {
            try sameState(&checkpoint, &current.sections[0].structure_values.?.paragraphs[0]);
            return err;
        };
        _ = try branch.setCharacterFormat(0, 1, 1, 2, id);
        try compare(a, &current, &branch);
    }
    const before_noop = try current.save();
    defer a.free(before_noop);
    try std.testing.expect(!try current.setCharacterFormat(0, 1, 1, 2, 2));
    const after_noop = try current.save();
    defer a.free(after_noop);
    try std.testing.expectEqualSlices(u8, before_noop, after_noop);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}
test "derived trailing gap actual Session same style chained reformat preserves canonical gaps" {
    try run(std.testing.allocator);
}
test "derived trailing gap actual Session OOM clone writer collect keeps model atomic" {
    try @import("../testing/allocation_failures.zig").check(run, .{});
}

fn leading(a: std.mem.Allocator) !void {
    const xml = head ++ "<p:run charPrIDRef='1'><p:t><p:titleMark ignore='1'/>BC</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    _ = try current.setCharacterFormat(0, 1, 0, 1, 2);
    const first = try current.save();
    defer a.free(first);
    var reopened = try editor.open(a, first, .{});
    defer reopened.deinit();
    _ = try current.splice(0, 1, 0, 0, "Y");
    _ = try reopened.splice(0, 1, 0, 0, "Y");
    var checkpoint = try current.sections[0].structure_values.?.paragraphs[0].clone(a);
    defer checkpoint.deinit(a);
    _ = current.setCharacterFormat(0, 1, 0, 1, 2) catch |err| {
        try sameState(&checkpoint, &current.sections[0].structure_values.?.paragraphs[0]);
        return err;
    };
    _ = try reopened.setCharacterFormat(0, 1, 0, 1, 2);
    try compare(a, &current, &reopened);
    const saved = try current.save();
    defer a.free(saved);
    var result = try editor.open(a, saved, .{});
    defer result.deinit();
    // Marker style2 and old derived gap1 are independent obligations.
    const expected = head ++ "<p:run charPrIDRef='2'><p:t>Y<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t></p:t></p:run><p:run charPrIDRef='2'><p:t>B</p:t></p:run><p:run charPrIDRef='1'><p:t>C</p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, result.sections[0].tree.source);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}
test "derived standalone leading title gap insertion reformat exact parity" {
    try leading(std.testing.allocator);
}
test "derived standalone leading title gap reformat OOM atomic" {
    try @import("../testing/allocation_failures.zig").check(leading, .{});
}
