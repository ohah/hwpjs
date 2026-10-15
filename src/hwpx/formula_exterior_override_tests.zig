const std = @import("std");
const editor = @import("editor_session.zig");
const exterior = "<p:p><p:run><p:t>outside</p:t><p:ctrl><p:fieldBegin id='2' type='HYPERLINK'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p>";

fn staleInput(a: std.mem.Allocator) ![]u8 {
    const source = @import("test_formula_fixture.zig").section;
    const table = std.mem.indexOf(u8, source, "<p:tbl").?;
    const result = std.mem.lastIndexOf(u8, source, "<p:t>2</p:t>").?;
    const xml = try std.mem.concat(a, u8, &.{ source[0..table], exterior, source[table..result], "<p:t>100</p:t>", source[result + "<p:t>2</p:t>".len ..] });
    defer a.free(xml);
    return @import("test_formula_fixture.zig").zipWithSection(a, xml);
}
fn verify(a: std.mem.Allocator, input: []const u8) !void {
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 4, 4 * 1024 * 1024);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "한😀" }));
    var current = try @import("formula_current_snapshot.zig").readFlat(a, &session, 0);
    defer current.deinit(a);
    try std.testing.expectEqualStrings("100", current.rows[0].values.last_result.?);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    var after = try @import("formula_current_snapshot.zig").readFlat(a, &reopened, 0);
    defer after.deinit(a);
    try std.testing.expectEqualStrings("100", after.rows[0].values.last_result.?);
    try std.testing.expectEqualStrings("2", after.source.rows[0].values.last_result.?);
    const original = session.sections[0].tree.source;
    const location = std.mem.indexOf(u8, original, "<p:t>outside").? + "<p:t>".len;
    const expected = try std.mem.concat(a, u8, &.{ original[0..location], "한😀", original[location..] });
    defer a.free(expected);
    try std.testing.expectEqualSlices(u8, expected, reopened.sections[0].tree.source);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
test "HWPX exterior edit preserves unrelated stale formula display cache XML and history" {
    const a = std.testing.allocator;
    const input = try staleInput(a);
    defer a.free(input);
    try verify(a, input);
}
test "HWPX exterior source display preservation allocation failures" {
    const a = std.testing.allocator;
    const input = try staleInput(a);
    defer a.free(input);
    try @import("../testing/allocation_failures.zig").check(verify, .{input});
}
