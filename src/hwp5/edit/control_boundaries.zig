//! Splice boundaries for retained control tokens. Control semantics and owning
//! records remain the responsibility of source eligibility and linkage checks.
const std = @import("std");
const Text = @import("../body/text.zig").Text;
const content = @import("plain_text_content.zig");
const scalars = @import("../../text/scalars.zig");

pub const retained_mask: u32 = (1 << 2) | (1 << 3) | (1 << 4) | (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 13) | (1 << 16) | (1 << 17) | (1 << 18) | (1 << 21) | (1 << 22) | (1 << 23) | (1 << 24) | (1 << 30) | (1 << 31);

/// Retained tabs and known anchors. Source eligibility separately validates
/// extended control/header linkage and local hyperlink marker ownership.
pub fn validateRetainedText(bytes: []const u8) !void {
    const text = try Text.parse(bytes);
    var it = text.tokens();
    while (try it.next()) |token| switch (token.value) {
        .control => |c| {
            if (c.code == 8) {
                _ = try @import("../body/title_mark.zig").parse(c);
            } else if (c.code == 13) {
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
    return validateMode(bytes, start, end, false);
}

/// Internal prefix/suffix projection on split drafts, not an ordinary delete.
pub fn validatePartition(bytes: []const u8, start: u32, end: u32) !void {
    const text = try Text.parse(bytes);
    var iterator = text.tokens();
    while (try iterator.next()) |token| if (token.value == .control) {
        if (token.raw.len != 2 or (token.value.control.code != 10 and token.value.control.code != 13)) return error.UnsupportedStructuralControl;
    };
    if (bytes.len < 2 or (start != 0 and end != bytes.len / 2 - 1)) return error.InvalidTextPosition;
    return validateMode(bytes, start, end, true);
}

fn validateMode(bytes: []const u8, start: u32, end: u32, partition: bool) !void {
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
        if (start < last and end > first and !(partition and token.value.control.code == 10)) return error.UnsupportedControlDeletion;
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

test "control boundaries retain official nonbreaking and fixed width spaces without granting deletion" {
    const bytes = [_]u8{ 30, 0, 'x', 0, 31, 0, 13, 0 };
    try validateRetainedText(&bytes);
    for (0..4) |unit| try validate(&bytes, @intCast(unit), @intCast(unit));
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 0, 1));
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 2, 3));
    inline for (.{ 0, 25, 26, 27, 28, 29 }) |code| {
        try std.testing.expectError(error.UnsupportedTextControl, validateRetainedText(&.{ code, 0, 13, 0 }));
    }
    try std.testing.expect(retained_mask & (@as(u32, 1) << 30) != 0);
    try std.testing.expect(retained_mask & (@as(u32, 1) << 31) != 0);
}

test "control boundaries retain official hyphen without granting deletion or structural split" {
    const bytes = [_]u8{ 'a', 0, 24, 0, 'b', 0, 13, 0 };
    try validateRetainedText(&bytes);
    for (0..4) |unit| try validate(&bytes, @intCast(unit), @intCast(unit));
    try validate(&bytes, 0, 1);
    try validate(&bytes, 2, 3);
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 1, 2));
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 0, 3));
    try std.testing.expectError(error.UnsupportedStructuralControl, validatePartition(&bytes, 0, 1));
    try std.testing.expect(retained_mask & (@as(u32, 1) << 24) != 0);
}

test "control boundaries preserve observed title slot and reject deletion and unknown inline IDs" {
    var bytes = [_]u8{ 8, 0, 't', 'i', 't', 'M', 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 'x', 0, 13, 0 };
    try validateRetainedText(&bytes);
    try validate(&bytes, 0, 0);
    try validate(&bytes, 8, 8);
    try validate(&bytes, 8, 9);
    for (1..8) |unit| try std.testing.expectError(error.SplitControlToken, validate(&bytes, @intCast(unit), @intCast(unit)));
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 0, 8));
    bytes[2] = 'x';
    try std.testing.expectError(error.UnsupportedTitleMark, validateRetainedText(&bytes));
    bytes[2] = 't';
    bytes[6] = 1;
    try std.testing.expectError(error.UnsupportedTitleMarkData, validateRetainedText(&bytes));
}

test "control splice boundaries retain line breaks but reject their deletion" {
    const bytes = [_]u8{ 'a', 0, 10, 0, 'b', 0, 13, 0 };
    try validateRetainedText(&bytes);
    try validate(&bytes, 0, 0);
    try validate(&bytes, 1, 1);
    try validate(&bytes, 2, 2);
    try validate(&bytes, 2, 3);
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 1, 2));
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 0, 3));
}

test "control split projections permit only prefix or suffix movement of line breaks" {
    const bytes = [_]u8{ 'A', 0, 10, 0, 'B', 0, 10, 0, 'C', 0, 13, 0 };
    for (0..6) |cut| {
        try validatePartition(&bytes, 0, @intCast(cut));
        try validatePartition(&bytes, @intCast(cut), 5);
    }
    try std.testing.expectError(error.InvalidTextPosition, validatePartition(&bytes, 1, 2));
    try std.testing.expectError(error.InvalidTextPosition, validatePartition(&bytes, 0, 6));
    try std.testing.expectError(error.UnsupportedControlDeletion, validate(&bytes, 0, 5));
    const tab = [_]u8{ 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 13, 0 };
    try std.testing.expectError(error.UnsupportedStructuralControl, validatePartition(&tab, 0, 8));
}
