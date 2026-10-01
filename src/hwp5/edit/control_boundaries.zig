//! Splice boundaries for retained control tokens. Control semantics and owning
//! records remain the responsibility of source eligibility and linkage checks.
const std = @import("std");
const Text = @import("../body/text.zig").Text;
const content = @import("plain_text_content.zig");
const scalars = @import("../../text/scalars.zig");

pub const retained_mask: u32 = (1 << 2) | (1 << 3) | (1 << 4) | (1 << 9) | (1 << 11) | (1 << 13) | (1 << 16) | (1 << 17) | (1 << 18) | (1 << 21) | (1 << 22) | (1 << 23);

/// Retained tabs and known anchors. Source eligibility separately validates
/// extended control/header linkage and local hyperlink marker ownership.
pub fn validateRetainedText(bytes: []const u8) !void {
    const text = try Text.parse(bytes);
    var it = text.tokens();
    while (try it.next()) |token| switch (token.value) {
        .control => |c| {
            if (c.code == 13) {
                if (token.start_unit + 1 != text.unitCount()) return error.UnsupportedTextControl;
            } else if (c.code >= 32 or retained_mask & (@as(u32, 1) << @intCast(c.code)) == 0)
                return error.UnsupportedTextControl;
        },
        .text => |raw| {
            var at: usize = 0;
            while (try scalars.read(raw, at, .utf16le)) |c| at = c.end;
        },
    };
}

/// The final PARA_BREAK and every other control are retained byte-for-byte.
/// Positions at either side of a control are valid; its interior is not.
pub fn validate(bytes: []const u8, start: u32, end: u32) !void {
    const text = try Text.parse(bytes);
    if (bytes.len < 2 or std.mem.readInt(u16, bytes[bytes.len - 2 ..][0..2], .little) != 13)
        return error.UnsupportedParagraphTerminator;
    if (start > end or end > bytes.len / 2 - 1) return error.InvalidTextPosition;
    try content.boundary(bytes, start);
    try content.boundary(bytes, end);
    var tokens = text.tokens();
    while (try tokens.next()) |token| {
        if (token.value != .control) continue;
        const first = token.start_unit;
        const last = first + token.raw.len / 2;
        if ((start > first and start < last) or (end > first and end < last))
            return error.SplitControlToken;
        if (start < last and end > first) return error.UnsupportedControlDeletion;
    }
}

test "control splice boundaries preserve inline payload and both edge positions" {
    const bytes = [_]u8{ 9, 0, 0xa0, 0x0f, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 9, 0, '-', 0, ' ', 0, 13, 0 };
    try validate(&bytes, 0, 0);
    try validate(&bytes, 8, 8);
    try validate(&bytes, 8, 10);
    for (1..8) |i| {
        try std.testing.expectError(error.SplitControlToken, validate(&bytes, @intCast(i), @intCast(i)));
        try std.testing.expectError(error.SplitControlToken, validate(&bytes, 0, @intCast(i)));
    }
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 0, 8));
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 0, 10));
    try std.testing.expectError(error.InvalidTextPosition, validate(&bytes, 10, 11));
}

test "control splice boundaries retain field markers and Unicode scalar boundaries" {
    const bytes = [_]u8{ 3, 0, 'k', 'l', 'h', '%', 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0x3d, 0xd8, 0, 0xde, 4, 0, 'k', 'l', 'h', 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 13, 0 };
    try validate(&bytes, 8, 10);
    try validate(&bytes, 10, 10);
    try std.testing.expectError(error.SplitSurrogatePair, validate(&bytes, 9, 9));
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 8, 18));
    try std.testing.expectError(error.SplitControlToken, validate(&bytes, 8, 11));
}

test "control splice boundaries reject malformed framing and missing terminator" {
    try std.testing.expectError(error.InvalidTextSize, validate(&.{13}, 0, 0));
    try std.testing.expectError(error.UnsupportedParagraphTerminator, validate(&.{ 'x', 0 }, 0, 0));
    try std.testing.expectError(error.InvalidControlTerminator, validate(&.{ 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 13, 0 }, 0, 0));
}
