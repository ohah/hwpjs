const std = @import("std");
const t = std.testing;
const xp = @import("hwpx/editor_session.zig");
const hp = @import("hwp5/edit/style_preservation.zig");
const snapshot = @import("hwpx/character_style_snapshot.zig");
fn input(a: std.mem.Allocator, suffix: []const u8) ![]u8 {
    const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.{s}", .{suffix});
    defer a.free(path);
    return std.Io.Dir.cwd().readFileAlloc(t.io, path, a, .limited(4_000_000));
}
fn checkXp(session: *const xp.Session, paragraph: usize, id: u32) !void {
    const ranges = try snapshot.read(session, 0, paragraph);
    defer t.allocator.free(ranges);
    for (ranges) |range| if (range.start_unit == 0 and range.end_unit > 0) {
        try t.expectEqual(@as(?u32, id), range.char_shape_id);
        return;
    };
    return error.TestExpectedEqual;
}
fn xpLifecycle(current: bool) !void {
    const a = t.allocator;
    const bytes = try input(a, "hwpx");
    defer a.free(bytes);
    var session = try xp.open(a, bytes, .{});
    defer session.deinit();
    if (current) _ = try session.setCharacterFormat(0, 2, 3, 6, 3);
    const expected: u32 = if (current) 3 else 5;
    const before_split = try session.save();
    defer a.free(before_split);
    var history = try @import("hwpx/editor_history.zig").History.init(&session, 8, 16_000_000);
    defer history.deinit();
    try t.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 2, .start = 6, .deleted = 0, .inserted = "" }));
    const split = try session.save();
    defer a.free(split);
    // 저장/재열기 직후에도 첫 입력이 같은 continuation 스타일을 선택해야 합니다.
    var reopened = try xp.open(a, split, .{});
    defer reopened.deinit();
    try t.expect(try reopened.splice(0, 3, 0, 0, "x"));
    try checkXp(&reopened, 3, expected);
    try t.expect(try history.apply(&session, .{ .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" }));
    try checkXp(&session, 3, expected);
    const saved = try session.save();
    defer a.free(saved);
    const roundtrip = try reopened.save();
    defer a.free(roundtrip);
    try t.expectEqualSlices(u8, saved, roundtrip);
    try t.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, split, undone);
    try t.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    try t.expect(try history.undo(&session));
    try t.expect(try history.undo(&session));
    const initial = try session.save();
    defer a.free(initial);
    try t.expectEqualSlices(u8, before_split, initial);
    try t.expect(try history.redo(&session));
    try t.expect(try history.redo(&session));
    const repeated = try session.save();
    defer a.free(repeated);
    try t.expectEqualSlices(u8, saved, repeated);
}
test "continuation HWPX source end keeps style through save reopen undo redo" {
    try xpLifecycle(false);
}
test "continuation HWPX owned style end keeps style through save reopen undo redo" {
    try xpLifecycle(true);
}
fn hpLifecycle(current: bool) !void {
    const a = t.allocator;
    const bytes = try input(a, "hwp");
    defer a.free(bytes);
    const s = try hp.Session.open(a, bytes);
    defer s.close();
    if (current) try s.apply(.{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 3, .end_unit = 6, .char_shape_id = 3 } });
    const expected: u32 = if (current) 3 else 5;
    const before_split = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(before_split.bytes);
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, s, 8, 16_000_000);
    defer history.deinit();
    try t.expect(try history.apply(s, .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 6 } }));
    const split = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(split.bytes);
    const reopened = try hp.Session.open(a, split.bytes);
    defer reopened.close();
    try reopened.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "x" } });
    try t.expect(try history.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }));
    const ranges = try s.characterRanges(a, 0, 2);
    defer a.free(ranges);
    try t.expectEqual(@as(?u32, expected), ranges[0].char_shape_id);
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const roundtrip = try reopened.save(a, .{ .allow_stale_layout = true });
    defer a.free(roundtrip.bytes);
    try t.expectEqualSlices(u8, saved.bytes, roundtrip.bytes);
    try t.expect(try history.undo(s));
    const undone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try t.expectEqualSlices(u8, split.bytes, undone.bytes);
    try t.expect(try history.redo(s));
    const redone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try t.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try t.expect(try history.undo(s));
    try t.expect(try history.undo(s));
    const initial = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(initial.bytes);
    try t.expectEqualSlices(u8, before_split.bytes, initial.bytes);
    try t.expect(try history.redo(s));
    try t.expect(try history.redo(s));
    const repeated = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(repeated.bytes);
    try t.expectEqualSlices(u8, saved.bytes, repeated.bytes);
}
test "continuation HWP source end remains positive" {
    try hpLifecycle(false);
}
test "continuation HWP owned visible end overrides old CR style" {
    try hpLifecycle(true);
}
comptime {
    _ = @import("hwpx/empty_continuation_style_tests.zig");
}
comptime {
    _ = @import("hwp5/edit/continuation_style_tests.zig");
}

test "continuation HWPX repeated empty split keeps owned style and site count" {
    const a = t.allocator;
    const bytes = try input(a, "hwpx");
    defer a.free(bytes);
    var session = try xp.open(a, bytes, .{});
    defer session.deinit();
    _ = try session.setCharacterFormat(0, 2, 3, 6, 3);
    try t.expect(try session.splitParagraph(0, 2, 6, 0));
    const count = session.sections[0].structure_values.?.paragraphs[2].sites.items.len;
    try t.expect(try session.splitParagraph(0, 3, 0, 0));
    try t.expectEqual(count, session.sections[0].structure_values.?.paragraphs[3].sites.items.len);
    try t.expect(try session.splice(0, 4, 0, 0, "x"));
    try checkXp(&session, 4, 3);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try xp.open(a, saved, .{});
    defer reopened.deinit();
    try checkXp(&reopened, 4, 3);
}
