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

fn prepared(a: std.mem.Allocator, bytes: []const u8) !editor.Session {
    var session = try editor.open(a, bytes, .{});
    errdefer session.deinit();
    _ = try session.setCharacterFormat(0, 1, 0, 1, 2);
    _ = try session.setCharacterFormat(0, 1, 1, 2, 2);
    return session;
}
fn controls(a: std.mem.Allocator) !void {
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try prepared(a, bytes);
    defer session.deinit();
    const row = &session.sections[0].structure_values.?.paragraphs[0];
    var copy = try row.clone(a);
    defer copy.deinit(a);
    try sameState(row, &copy);
    const plan = &row.title_output_projection.?;
    const clone = &copy.title_output_projection.?;
    try std.testing.expect(plan.derived_gaps.len >= 2);
    try std.testing.expect(plan.derived_gaps.ptr != clone.derived_gaps.ptr);
    try std.testing.expect(plan.ranges.ptr != clone.ranges.ptr);
    clone.derived_gaps[0].materialized = !clone.derived_gaps[0].materialized;
    try std.testing.expectError(error.SourceBindingMismatch, clone.validate(&copy));
    try plan.validate(row);
    clone.derived_gaps[0] = plan.derived_gaps[0];
    try clone.validate(&copy);
    // Accounting delta is exact, rather than a loose nonzero check.
    const values = &session.sections[0].structure_values.?;
    const charged = try values.byteSize(std.math.maxInt(usize));
    const saved_gaps = plan.derived_gaps;
    plan.derived_gaps = &.{};
    const uncharged = values.byteSize(std.math.maxInt(usize)) catch |err| {
        plan.derived_gaps = saved_gaps;
        return err;
    };
    plan.derived_gaps = saved_gaps;
    try std.testing.expectEqual(saved_gaps.len * @sizeOf(@import("title_derived_gap.zig").Gap), charged - uncharged);
    try std.testing.expectEqual(charged, try values.byteSize(charged));
    try std.testing.expectError(error.LimitExceeded, values.byteSize(charged - 1));
    var before = try row.clone(a);
    defer before.deinit(a);
    // Same-format no-op must not append a canonical gap or change its identity.
    for (0..8) |_| {
        const changed = session.setCharacterFormat(0, 1, 1, 2, 2) catch |err| {
            try sameState(&before, &session.sections[0].structure_values.?.paragraphs[0]);
            return err;
        };
        try std.testing.expect(!changed);
        try sameState(&before, &session.sections[0].structure_values.?.paragraphs[0]);
    }
    const current = &session.sections[0].structure_values.?.paragraphs[0];
    var tiny = current.title_output_projection.?.options;
    tiny.max_sites = 1;
    if (@import("title_output_projection.zig").prepare(a, &session.sections[0].tree, current, tiny, current.title_output_projection.?.max_xml_bytes)) |unexpected| {
        if (unexpected) |value| {
            var cleanup = value;
            cleanup.deinit(a);
        }
        return error.ExpectedLimitExceeded;
    } else |err| {
        try sameState(&before, current);
        if (err == error.OutOfMemory) return err;
        try std.testing.expect(err == error.LimitExceeded);
    }
    if (@import("title_output_projection.zig").prepare(a, &session.sections[0].tree, current, current.title_output_projection.?.options, 1)) |unexpected| {
        if (unexpected) |value| {
            var cleanup = value;
            cleanup.deinit(a);
        }
        return error.ExpectedLimitExceeded;
    } else |err| {
        try sameState(&before, current);
        if (err == error.OutOfMemory) return err;
        try std.testing.expect(err == error.LimitExceeded);
    }
    try sameState(&before, current);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
test "derived ledger clone isolation no-op eight repeats exact accounting and limits" {
    try controls(std.testing.allocator);
}
test "derived ledger clone no-op budget failures OOM leaves original state valid" {
    try @import("../testing/allocation_failures.zig").check(controls, .{});
}
test "derived ledger twelve style flips preserve duplicate old gaps and source binding" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var current = try prepared(a, bytes);
    defer current.deinit();
    for (0..12) |turn| {
        const saved = try current.save();
        defer a.free(saved);
        var branch = try editor.open(a, saved, .{});
        defer branch.deinit();
        const before = current.sections[0].structure_values.?.paragraphs[0].title_output_projection.?.derived_gaps.len;
        const id: u32 = if (turn % 2 == 0) 1 else 2;
        _ = try current.setCharacterFormat(0, 1, 1, 2, id);
        _ = try branch.setCharacterFormat(0, 1, 1, 2, id);
        try compare(a, &current, &branch);
        const plan = current.sections[0].structure_values.?.paragraphs[0].title_output_projection.?;
        // One new implicit gap plus every prior explicit gap, even matching styles.
        try std.testing.expectEqual(before + 1, plan.derived_gaps.len);
        try std.testing.expect(!plan.derived_gaps[0].materialized);
        for (plan.derived_gaps[1..]) |gap| try std.testing.expect(gap.materialized);
        try std.testing.expectEqualSlices(u8, bytes, current.source);
    }
}

fn limitAtomic(a: std.mem.Allocator) !void {
    const bytes = try input(a);
    defer a.free(bytes);
    var current = try prepared(a, bytes);
    defer current.deinit();
    const saved = try current.save();
    defer a.free(saved);
    var frozen = try editor.open(a, saved, .{});
    defer frozen.deinit();
    // Exact successful canonical output capacity. Next real format needs one more gap.
    current.options.max_sites = frozen.sections[0].sites.items.len;
    var before = try current.sections[0].structure_values.?.paragraphs[0].clone(a);
    defer before.deinit(a);
    if (current.setCharacterFormat(0, 1, 1, 2, 1)) |_| {
        return error.ExpectedLimitExceeded;
    } else |err| {
        try sameState(&before, &current.sections[0].structure_values.?.paragraphs[0]);
        try std.testing.expectEqualSlices(u8, bytes, current.source);
        if (err == error.OutOfMemory) return err;
        try std.testing.expect(err == error.LimitExceeded);
    }
}
test "derived ledger real format refuses canonical site budget growth atomically" {
    try limitAtomic(std.testing.allocator);
}
test "derived ledger budget rejection OOM leaves original ledger and source unchanged" {
    try @import("../testing/allocation_failures.zig").check(limitAtomic, .{});
}

test "derived interior marker canonical fragment survives uniform style restoration" {
    const a = std.testing.allocator;
    const xml = head ++ "<p:run charPrIDRef='1'><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    _ = try current.setCharacterFormat(0, 1, 1, 2, 2);
    const first = try current.save();
    defer a.free(first);
    var branch = try editor.open(a, first, .{});
    defer branch.deinit();
    _ = try current.setCharacterFormat(0, 1, 1, 2, 1);
    _ = try branch.setCharacterFormat(0, 1, 1, 2, 1);
    try compare(a, &current, &branch);
    const second = try current.save();
    defer a.free(second);
    var result = try editor.open(a, second, .{});
    defer result.deinit();
    const expected = head ++ "<p:run charPrIDRef='1'><p:t>B<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t>C</p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, result.sections[0].tree.source);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}

test "derived structural endpoint initial uniform middle title remains original single t" {
    const a = std.testing.allocator;
    const xml = head ++ "<p:run charPrIDRef='1'><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, xml, header);
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    _ = try current.setCharacterFormat(0, 1, 0, 2, 2);
    const saved = try current.save();
    defer a.free(saved);
    var result = try editor.open(a, saved, .{});
    defer result.deinit();
    const expected = head ++ "<p:run charPrIDRef='2'><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, result.sections[0].tree.source);
    try std.testing.expectEqual(@as(usize, 0), current.sections[0].structure_values.?.paragraphs[0].title_output_projection.?.derived_gaps.len);
}
test "derived structural endpoint original trailing title unchanged by unrelated sibling reformat" {
    const a = std.testing.allocator;
    const body = "<p:run charPrIDRef='1'><p:t>BC<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t>T</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, head ++ body, header);
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    _ = try current.setCharacterFormat(0, 1, 2, 3, 2);
    const count = current.sections[0].structure_values.?.paragraphs[0].title_output_projection.?.derived_gaps.len;
    _ = try current.setCharacterFormat(0, 1, 2, 3, 1);
    const saved = try current.save();
    defer a.free(saved);
    var result = try editor.open(a, saved, .{});
    defer result.deinit();
    try std.testing.expectEqualStrings(head ++ body, result.sections[0].tree.source);
    try std.testing.expectEqual(count, current.sections[0].structure_values.?.paragraphs[0].title_output_projection.?.derived_gaps.len);
}
