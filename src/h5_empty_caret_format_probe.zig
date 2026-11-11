const std = @import("std");
const edit = @import("hwp5/edit/style_preservation.zig");
const Backend = @import("hwp5/edit/formatting_projection.zig").Backend;
const a = std.testing.allocator;
fn open() !*edit.Session {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/page.hwp", a, .limited(4_000_000));
    defer a.free(input);
    return edit.Session.open(a, input);
}
test "H5 empty caret real source declaration follows text and history without mutation" {
    const session = try open();
    defer session.close();
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const aa = arena.allocator();
    const backend: Backend = .{ .session = session, .allocator = aa };
    const owner: @import("model/formatting_patch.zig").Owner = .{ .section = 0, .paragraph = 4 };
    const before = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    const size = try backend.insertionField(aa, owner, 0, "character.size");
    try std.testing.expectEqual(.known, size.state);
    try std.testing.expectEqual(@as(i64, 1000), size.value.?.integer);
    try std.testing.expect(!size.writable);
    try size.validate();
    const name = try backend.insertionField(aa, owner, 0, "character.fonts.hangul.name");
    try std.testing.expectEqual(.known, name.state);
    try std.testing.expectEqualStrings("바탕", name.value.?.string);
    const after = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
    var history = try @import("hwp5/edit/editor_history.zig").History.initV2(a, session, .{ .max_entries = 8 });
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 4, .start_unit = 0, .end_unit = 0, .utf8 = "x" } }));
    try std.testing.expectEqual(.unknown, (try backend.insertionField(aa, owner, 0, "character.size")).state);
    try std.testing.expect(try history.undo(session));
    try std.testing.expectEqual(@as(i64, 1000), (try backend.insertionField(aa, owner, 0, "character.size")).value.?.integer);
    try std.testing.expect(try history.redo(session));
    try std.testing.expectEqual(.unknown, (try backend.insertionField(aa, owner, 0, "character.size")).state);
    try std.testing.expectEqual(.unknown, (try backend.insertionField(aa, owner, 1, "character.size")).state);
}
fn ranges(a2: std.mem.Allocator, p: @import("model/document.zig").Paragraph) !void {
    const rows = try @import("hwp5/edit/character_display_ranges.zig").read(a2, p, 2);
    defer a2.free(rows);
    try std.testing.expect(rows.len == 1 and rows[0].insertion);
    const wire = try @import("wasm/character_ranges_wire.zig").encode(a2, rows);
    defer a2.free(wire);
    try std.testing.expectEqual(@as(u32, 3), std.mem.readInt(u32, wire[20..24], .little));
}
test "H5 empty caret missing text counterexamples and allocation failure" {
    const session = try open();
    defer session.close();
    var runs = [_]@import("model/document.zig").CharacterRun{.{ .start_unit = 0, .char_shape_id = 1 }};
    const original: @import("model/document.zig").Paragraph = .{ .source_node = 22, .parent_node = null, .declared_units = 1, .text_present = false, .para_shape_id = 0, .style_id = 0, .tokens = &.{}, .character_runs = &runs, .deferred_direct_records = 0 };
    try std.testing.expect(!original.text_present and original.declared_units == 1 and original.tokens.len == 0);
    try @import("testing/allocation_failures.zig").check(ranges, .{original});
    var broken = original;
    broken.declared_units = 9;
    const rows = try @import("hwp5/edit/character_display_ranges.zig").read(a, broken, 2);
    defer a.free(rows);
    try std.testing.expect(rows.len == 1 and !rows[0].insertion);
    broken = original;
    broken.character_runs = &.{};
    const absent = try @import("hwp5/edit/character_display_ranges.zig").read(a, broken, 2);
    defer a.free(absent);
    try std.testing.expectEqual(@as(usize, 0), absent.len);
}
