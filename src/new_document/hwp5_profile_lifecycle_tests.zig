//! Real common constructor -> owned history -> save/reopen, authored for later
//! authorized Native execution. No fixture/resource/old-document migration.
const std = @import("std");
const root = @import("root.zig");
const edit = @import("../hwp5/edit/style_preservation.zig");
const History = @import("../hwp5/edit/editor_history.zig").History;
const a = std.testing.allocator;

fn insertion() edit.Command {
    return .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "A" } };
}
fn decorations() edit.Command {
    return .{ .set_character_properties = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 17, .properties = .{
        .underline_kind = .bottom,
        .underline_style = .DOT,
        .underline_color = 0xabcdef,
        .strike_enabled = true,
        .strike_style = .DASH,
        .strike_color = 0x123456,
    } } };
}
fn inspectDecorations(session: *edit.Session) !void {
    try std.testing.expectEqual(@as(u32, 0x05000300), session.fileVersion());
    const shapes = try session.characterShapes(a);
    defer a.free(shapes);
    const ranges = try session.characterRanges(a, 0, 0);
    defer a.free(ranges);
    const id = for (ranges) |range| {
        if (range.start_unit <= 16 and range.end_unit > 16) break range.char_shape_id.?;
    } else return error.MissingModernDecorationRange;
    const shape = shapes[id];
    try std.testing.expectEqual(@as(u2, 1), shape.underline_kind_raw);
    try std.testing.expectEqual(@as(u3, 1), shape.strike_kind_raw);
    try std.testing.expectEqual(@as(u4, 2), shape.underline_style_raw);
    try std.testing.expectEqual(@as(u4, 1), shape.strike_style_raw);
    // Independent expected COLORREF values, not writer-derived expectations.
    try std.testing.expectEqual(@as(u32, 0xefcdab), shape.underline_color_raw);
    try std.testing.expectEqual(@as(?u32, 0x563412), shape.strike_color_raw);
}

test "new document modern default simultaneous independent decoration colors save reopen and owned undo redo" {
    const source = try root.hwp5(a);
    defer a.free(source);
    const session = try edit.Session.open(a, source);
    defer session.close();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    try std.testing.expect(try history.apply(session, insertion()));
    const plain = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(plain.bytes);
    const before = history.revisionCount();
    try std.testing.expect(try history.apply(session, decorations()));
    try std.testing.expectEqual(before + 1, history.revisionCount());
    try inspectDecorations(session);
    try std.testing.expect(!try history.apply(session, decorations()));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try inspectDecorations(reopened);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, plain.bytes, undone.bytes);
    const revision = history.revision();
    var invalid = decorations();
    invalid.set_character_properties.properties.strike_color = 0x1000000;
    try std.testing.expectError(error.InvalidCharacterColor, history.apply(session, invalid));
    try std.testing.expectEqual(revision, history.revision());
    const refused = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(refused.bytes);
    try std.testing.expectEqualSlices(u8, plain.bytes, refused.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.undo(session));
    const original = try session.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, source, original.bytes);
}

test "new document explicit legacy keeps absent strike color guard full bytes and prior redo" {
    const source = try root.hwp5WithProfile(a, .legacy_5_0_1_7);
    defer a.free(source);
    const session = try edit.Session.open(a, source);
    defer session.close();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    try std.testing.expect(try history.apply(session, insertion()));
    const plain = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(plain.bytes);
    var bold = decorations();
    bold.set_character_properties.properties = .{ .bold = true };
    try std.testing.expect(try history.apply(session, bold));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(try history.undo(session));
    const revision = history.revision();
    try std.testing.expectError(error.MissingCharacterStrikeColorField, history.apply(session, decorations()));
    try std.testing.expectEqual(revision, history.revision());
    const unchanged = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, plain.bytes, unchanged.bytes);
    try std.testing.expectEqual(@as(u32, 0x05000107), session.fileVersion());
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.undo(session));
    const original = try session.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, source, original.bytes);
}
