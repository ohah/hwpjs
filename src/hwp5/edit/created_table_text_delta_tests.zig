const std = @import("std");
const delta = @import("created_table_text_delta.zig");

test "HWP5 generated table derived text delta respects surrogate and whole control boundaries" {
    const before = std.unicode.utf8ToUtf16LeStringLiteral("a😀z\r");
    const after = std.unicode.utf8ToUtf16LeStringLiteral("a😁z\r");
    const change = try delta.between(std.mem.sliceAsBytes(before[0..before.len]), std.mem.sliceAsBytes(after[0..after.len]));
    try std.testing.expectEqualDeep(delta.Delta{ .start = 1, .deleted = 2, .inserted = 2 }, change);
    try std.testing.expectEqual(@as(u32, 0), try change.map(0));
    try std.testing.expectEqual(@as(u32, 3), try change.map(1));
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, change.map(2));
    try std.testing.expectEqual(@as(u32, 4), try change.map(4));
    const old_control = [_]u8{ 9, 0, 0xa0, 0x0f, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 9, 0, 13, 0 };
    var new_control = old_control;
    new_control[6] = 2;
    const control = try delta.between(&old_control, &new_control);
    try std.testing.expectEqualDeep(delta.Delta{ .start = 0, .deleted = 8, .inserted = 8 }, control);
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, control.map(4));
    try std.testing.expectEqual(@as(u32, 8), try control.map(8));
}

test "HWP5 generated table derived text delta preserves terminator noops and rejects malformed paragraphs" {
    const before = [_]u8{ 'a', 0, 13, 0 };
    const after = [_]u8{ 'a', 0, 'x', 0, 'y', 0, 13, 0 };
    const change = try delta.between(&before, &after);
    try std.testing.expectEqualDeep(delta.Delta{ .start = 1, .deleted = 0, .inserted = 2 }, change);
    try std.testing.expectEqual(@as(u32, 3), try change.map(1));
    const inverse = try delta.between(&after, &before);
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, inverse.map(2));
    try std.testing.expectEqual(@as(u32, 1), try inverse.map(3));
    try std.testing.expectEqualDeep(delta.Delta{ .start = 0, .deleted = 0, .inserted = 0 }, try delta.between(&before, &before));
    try std.testing.expectError(error.UnsupportedParagraphTerminator, delta.between(&.{ 'a', 0 }, &.{ 'a', 0 }));
    try std.testing.expectError(error.UnsupportedParagraphTerminator, delta.between(&.{}, &.{}));
    try std.testing.expectError(error.InvalidTextSize, delta.between(&.{13}, &before));
}
