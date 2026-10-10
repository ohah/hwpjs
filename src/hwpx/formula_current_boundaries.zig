//! Map current computed spans to authoritative raw paragraph coordinates.
const std = @import("std");
pub const Replacement = struct { start: u32, end: u32, shown_length: u32 };
pub const Range = struct { start: u32, end: u32 };

/// Replacements are sorted, disjoint whole formula spans. No cached model writes.
pub fn map(replacements: []const Replacement, raw_length: u32, start: u32, end: u32) !Range {
    if (end < start) return error.InvalidTextPosition;
    var raw: u32 = 0;
    var shown: u32 = 0;
    var mapped_start: ?u32 = null;
    var mapped_end: ?u32 = null;
    for (replacements) |replacement| {
        if (replacement.start < raw or replacement.end < replacement.start or replacement.end > raw_length) return error.SourceBindingMismatch;
        const before = std.math.add(u32, shown, replacement.start - raw) catch return error.LimitExceeded;
        try ordinary(&mapped_start, start, shown, before, raw);
        try ordinary(&mapped_end, end, shown, before, raw);
        const after = std.math.add(u32, before, replacement.shown_length) catch return error.LimitExceeded;
        if ((start > before and start < after) or (end > before and end < after) or (start < end and start < after and end > before)) return error.ProtectedFieldRange;
        if (before == after and start <= before and end >= before) return error.ProtectedFieldRange;
        if (start == before) try assign(&mapped_start, replacement.start);
        if (start == after) try assign(&mapped_start, replacement.end);
        if (end == before) try assign(&mapped_end, replacement.start);
        if (end == after) try assign(&mapped_end, replacement.end);
        raw = replacement.end;
        shown = after;
    }
    const length = std.math.add(u32, shown, raw_length - raw) catch return error.LimitExceeded;
    if (end > length) return error.InvalidTextPosition;
    try ordinary(&mapped_start, start, shown, length, raw);
    try ordinary(&mapped_end, end, shown, length, raw);
    return .{ .start = mapped_start orelse return error.SourceBindingMismatch, .end = mapped_end orelse return error.SourceBindingMismatch };
}

fn ordinary(output: *?u32, unit: u32, start: u32, end: u32, raw: u32) !void {
    if (unit < start or unit > end) return;
    try assign(output, std.math.add(u32, raw, unit - start) catch return error.LimitExceeded);
}
fn assign(output: *?u32, value: u32) !void {
    if (output.*) |old| if (old != value) return error.SourceBindingMismatch;
    output.* = value;
}

test "installed formula boundary mapping covers growth shrink multiple spans and protected deletion" {
    const replacements = [_]Replacement{ .{ .start = 2, .end = 6, .shown_length = 6 }, .{ .start = 8, .end = 12, .shown_length = 1 } };
    try std.testing.expectEqualDeep(Range{ .start = 6, .end = 6 }, try map(&replacements, 14, 8, 8));
    try std.testing.expectEqualDeep(Range{ .start = 8, .end = 8 }, try map(&replacements, 14, 10, 10));
    try std.testing.expectEqualDeep(Range{ .start = 12, .end = 14 }, try map(&replacements, 14, 11, 13));
    try std.testing.expectEqualDeep(Range{ .start = 6, .end = 8 }, try map(&replacements, 14, 8, 10));
    try std.testing.expectError(error.ProtectedFieldRange, map(&replacements, 14, 3, 3));
    try std.testing.expectError(error.ProtectedFieldRange, map(&replacements, 14, 2, 8));
    try std.testing.expectError(error.ProtectedFieldRange, map(&replacements, 14, 0, 13));
    try std.testing.expectError(error.InvalidTextPosition, map(&replacements, 14, 14, 14));
    try std.testing.expectError(error.SourceBindingMismatch, map(&.{ replacements[1], replacements[0] }, 14, 0, 0));
    try std.testing.expectError(error.ProtectedFieldRange, map(&.{.{ .start = 2, .end = 6, .shown_length = 0 }}, 8, 2, 2));
    try std.testing.expectError(error.LimitExceeded, map(&.{.{ .start = 2, .end = 6, .shown_length = std.math.maxInt(u32) }}, 8, 0, 0));
}
