//! Owned note body text in the same plain coordinate space as History.plain.
//! The snapshot owns projection and current paragraph order; no anchor trimming.
const std = @import("std");
const editor = @import("editor_session.zig");
const snapshot = @import("paragraph_text_snapshot.zig");

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize, paragraph: usize) ![]u8 {
    const rows = try snapshot.read(a, session, section);
    defer snapshot.free(a, rows);
    for (rows) |row| {
        if (row.paragraph == paragraph) return a.dupe(u8, row.text);
    }
    return error.InvalidParagraphIndex;
}

// This is the own fixture already used by the plain snapshot and anchor tests.
test "HWPX N02 plain body snapshot current edit split invalid indices and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const prefix = "\xef\xbf\xbc😀\r\n\t";
    try std.testing.expect(try session.splice(0, 2, 0, 0, prefix));
    const expected = prefix ++ " 각주입니다.";
    const current = try read(a, &session, 0, 2);
    defer a.free(current);
    try std.testing.expectEqualStrings(expected, current);
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, 999, 2));
    try std.testing.expectError(error.InvalidParagraphIndex, read(a, &session, 0, 999));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session) !void {
            const text = try read(allocator, state, 0, 2);
            defer allocator.free(text);
            try std.testing.expectEqualStrings(expected, text);
        }
    }.run, .{&session});
    // Current editor order after a split must beat the original source ordinal.
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const left = try read(a, &session, 0, 2);
    defer a.free(left);
    const right = try read(a, &session, 0, 3);
    defer a.free(right);
    try std.testing.expectEqualStrings("", left);
    try std.testing.expectEqualStrings(expected, right);
}
