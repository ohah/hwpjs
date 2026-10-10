const std = @import("std");
const commands = @import("character_property_text_commands.zig");

test "character property text transaction HWP5 preserves undo and redo after downstream failure" {
    try hwp5Transaction(false);
}

test "character property text transaction HWP5 combines font and properties atomically" {
    try hwp5Transaction(true);
}

fn hwp5Transaction(comptime with_font: bool) !void {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const Session = @import("../hwp5/edit/style_preservation.zig").Session;
    const session = try Session.open(a, bytes);
    defer session.close();
    const baseline = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(baseline.bytes);
    var history = try @import("../hwp5/edit/editor_history.zig").History.init(a, session, 4, 4_000_000);
    defer history.deinit();
    var batch = if (with_font)
        try commands.buildWithFont(.hwp5, .{ .section = 0, .paragraph = 5, .start = 0, .end = 1, .text = "한😀", .language = .hangul, .name = "Combined Typing Font" }, .{ .size = 1700, .bold = true, .italic = true })
    else
        try commands.build(.hwp5, .{ .section = 0, .paragraph = 5, .start = 0, .end = 1, .text = "한😀" }, .{ .size = 1700, .bold = true, .italic = true });
    try std.testing.expect(try history.applyBatch(session, &batch));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const text = try reopened.copyText(a, 0, 5);
    defer a.free(text);
    try std.testing.expectEqualSlices(u8, &.{ 0x5c, 0xd5, 0x3d, 0xd8, 0x00, 0xde }, text[0..6]);
    const ranges = try reopened.characterRanges(a, 0, 5);
    defer a.free(ranges);
    const shapes = try reopened.characterShapes(a);
    defer a.free(shapes);
    const shape = shapes[ranges[0].char_shape_id.?];
    try std.testing.expectEqual(@as(i32, 1700), shape.height);
    try std.testing.expect(shape.bold and shape.italic);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(!try history.undo(session));
    batch[batch.len - 1].set_character_properties.paragraph = 999_999;
    try std.testing.expectError(error.InvalidParagraph, history.applyBatch(session, &batch));
    const unchanged = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, baseline.bytes, unchanged.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "character property text transaction HWPX preserves undo and redo after downstream failure" {
    try hwpxTransaction(false);
}

test "character property text transaction HWPX combines font and properties atomically" {
    try hwpxTransaction(true);
}

fn hwpxTransaction(comptime with_font: bool) !void {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("../hwpx/editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const baseline = try session.save();
    defer a.free(baseline);
    var history = try @import("../hwpx/editor_history.zig").History.init(&session, 4, 4_000_000);
    defer history.deinit();
    var batch = if (with_font)
        try commands.buildWithFont(.hwpx, .{ .section = 0, .paragraph = 6, .start = 0, .end = 1, .text = "한😀", .language = .hangul, .name = "Combined Typing Font" }, .{ .size = 1700, .bold = true, .italic = true })
    else
        try commands.build(.hwpx, .{ .section = 0, .paragraph = 6, .start = 0, .end = 1, .text = "한😀" }, .{ .size = 1700, .bold = true, .italic = true });
    try std.testing.expect(try history.applyBatch(&session, &batch));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("../hwpx/editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const spans = try @import("../hwpx/character_style_snapshot.zig").read(&reopened, 0, 6);
    defer a.free(spans);
    try std.testing.expectEqual(@as(usize, 3), spans[0].end_unit);
    const shapes = try @import("../hwpx/character_style_resources.zig").displayShapes(&reopened);
    defer a.free(shapes);
    var checked = false;
    for (shapes) |shape| if (shape.id == spans[0].char_shape_id.?) {
        try std.testing.expectEqual(@as(?i32, 1700), shape.height);
        try std.testing.expect(shape.bold and shape.italic);
        checked = true;
    };
    try std.testing.expect(checked);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(!try history.undo(&session));
    batch[batch.len - 1].paragraph = 999_999;
    try std.testing.expectError(error.InvalidParagraphIndex, history.applyBatch(&session, &batch));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, baseline, unchanged);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
