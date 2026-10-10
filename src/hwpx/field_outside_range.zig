//! Field-exterior edits cannot consume labels or claim marker affinity.
const std = @import("std");
const Span = @import("field_current_spans.zig").Span;
pub fn validateWholeFieldSplit(spans: []const Span, paragraph: usize, start: u32, deleted: u32) !void {
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    for (spans) |span| {
        if (span.paragraph_index != paragraph) continue;
        if (span.end < span.start) return error.InvalidFieldSpan;
        if (deleted == 0) {
            if (span.start < start and start < span.end) return error.ProtectedFieldRange;
        } else if (start < span.end and end > span.start or span.start == span.end and start <= span.start and end >= span.end) return error.ProtectedFieldRange;
    }
}
pub fn validate(spans: []const Span, paragraph: usize, start: u32, deleted: u32) !void {
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    for (spans) |span| {
        if (span.paragraph_index != paragraph) continue;
        if (span.end < span.start) return error.InvalidFieldSpan;
        if (deleted == 0) {
            // Boundary insertion belongs to an explicit field-label command.
            if (start >= span.start and start <= span.end) return error.ProtectedFieldRange;
        } else if (start < span.end and end > span.start or span.start == span.end and start <= span.start and end >= span.end) return error.ProtectedFieldRange;
    }
}
test "field exterior range preserves labels markers and overflow boundaries" {
    const spans = [_]Span{ .{ .begin_element = 1, .paragraph_index = 2, .start = 7, .end = 35 }, .{ .begin_element = 2, .paragraph_index = 3, .start = 0, .end = 4 } };
    try validate(&spans, 2, 0, 0);
    try validate(&spans, 2, 0, 7);
    try validate(&spans, 2, 36, 0);
    try validate(&spans, 1, 0, 10);
    for ([_]u32{ 7, 8, 35 }) |start| try std.testing.expectError(error.ProtectedFieldRange, validate(&spans, 2, start, 0));
    try std.testing.expectError(error.ProtectedFieldRange, validate(&spans, 2, 6, 2));
    try std.testing.expectError(error.ProtectedFieldRange, validate(&spans, 2, 0, 36));
    try std.testing.expectError(error.InvalidTextPosition, validate(&spans, 2, std.math.maxInt(u32), 1));
    const empty = [_]Span{.{ .begin_element = 3, .paragraph_index = 2, .start = 7, .end = 7 }};
    try std.testing.expectError(error.ProtectedFieldRange, validate(&empty, 2, 7, 0));
    try std.testing.expectError(error.ProtectedFieldRange, validate(&empty, 2, 0, 8));
    const reversed = [_]Span{.{ .begin_element = 4, .paragraph_index = 2, .start = 8, .end = 7 }};
    try std.testing.expectError(error.InvalidFieldSpan, validate(&reversed, 2, 0, 0));
}
