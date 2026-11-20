//! Coordinate correspondence only. The whole transaction still admits the
//! actual source owner and metadata through their existing Native policies.
//! Pending positions must come from the canonical serializer receipt proof.
const std = @import("std");
const independent = @import("../model/independent_text_edits.zig");
const Cursor = @import("../text/utf8_utf16_splice.zig").Cursor;
const limits = @import("../model/text_transaction.zig").limits;
const object = "\xef\xbf\xbc";

/// Verify the entire observation against independently read current text,
/// removing exactly the proven pending anchors. Existing object characters
/// are retained. No caller-supplied offsets alone establish correspondence.
fn verify(observed: []const u8, current: []const u8, anchors: []const u32) !u32 {
    const units = try independent.utf16Units(observed);
    if (units > limits.text_units or anchors.len > units) return error.LimitExceeded;
    const current_units = try independent.utf16Units(current);
    if (current_units != units - anchors.len) return error.SourceBindingMismatch;
    var cursor: Cursor = .{ .text = observed };
    var current_byte: usize = 0;
    var previous: ?u32 = null;
    for (anchors) |point| {
        if (point >= units or (if (previous) |old| point <= old else false)) return error.SourceBindingMismatch;
        const retained = cursor.offset;
        const first = try cursor.seek(point);
        const last = try cursor.seek(point + 1);
        if (!std.mem.eql(u8, observed[first..last], object)) return error.SourceBindingMismatch;
        const length = first - retained;
        if (length > current.len -| current_byte or
            !std.mem.eql(u8, observed[retained..first], current[current_byte..][0..length])) return error.SourceBindingMismatch;
        current_byte += length;
        previous = point;
    }
    if (!std.mem.eql(u8, observed[cursor.offset..], current[current_byte..])) return error.SourceBindingMismatch;
    return units;
}

/// Owns the returned edit array; replacement/expected slices remain borrowed
/// from the request. One forward pass per text and per ordered list. A match
/// spanning a pending object is not a text-only mutation and is rejected.
pub fn map(a: std.mem.Allocator, observed: []const u8, current: []const u8, anchors: []const u32, edits: []const independent.Edit) ![]independent.Edit {
    const units = try verify(observed, current, anchors);
    _ = try independent.validate(edits, units, .{});
    const output = try a.alloc(independent.Edit, edits.len);
    errdefer a.free(output);
    var cursor: Cursor = .{ .text = observed };
    var removed: usize = 0;
    for (edits, output) |edit, *out| {
        while (removed < anchors.len and anchors[removed] < edit.start) : (removed += 1) {}
        if (removed < anchors.len and anchors[removed] < edit.end) return error.ProtectedPendingObjectBoundary;
        // A zero-length edit at either side of an inserted anchor needs an
        // explicit anchor affinity, which this text-only request does not own.
        if (edit.start == edit.end and ((removed < anchors.len and anchors[removed] == edit.start) or
            (removed != 0 and anchors[removed - 1] + 1 == edit.start))) return error.AmbiguousPendingAnchorBoundary;
        const expected = edit.expected orelse return error.MissingExpectedText;
        const first = try cursor.seek(edit.start);
        const last = try cursor.seek(edit.end);
        if (!std.mem.eql(u8, observed[first..last], expected)) return error.ExpectedTextMismatch;
        const count: u32 = @intCast(removed);
        out.* = .{ .start = edit.start - count, .end = edit.end - count, .text = edit.text, .expected = expected };
    }
    return output;
}

fn check(a: std.mem.Allocator) !void {
    const edits = try map(a, "A\xef\xbf\xbc😀B\xef\xbf\xbcC", "A😀BC", &.{ 1, 5 }, &.{
        .{ .start = 0, .end = 1, .text = "한", .expected = "A" },
        .{ .start = 2, .end = 4, .text = "둘", .expected = "😀" },
        .{ .start = 6, .end = 7, .text = "", .expected = "C" },
    });
    defer a.free(edits);
    try std.testing.expectEqual(@as(u32, 1), edits[1].start);
    try std.testing.expectEqual(@as(u32, 3), edits[1].end);
    try std.testing.expectEqual(@as(u32, 4), edits[2].start);
    const output = try @import("../text/utf8_utf16_splice.zig").replaceMany(a, "A😀BC", edits, 100, .{});
    defer a.free(output);
    try std.testing.expectEqualStrings("한둘B", output);
    // Existing source objects are not pending placeholders to remove.
    const existing = try map(a, object ++ object ++ "x", object ++ "x", &.{1}, &.{
        .{ .start = 2, .end = 3, .text = "y", .expected = "x" },
    });
    defer a.free(existing);
    try std.testing.expectEqual(@as(u32, 1), existing[0].start);
}

test "document text HX source axis retains existing objects and maps all pending offsets atomically" {
    try check(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(check, .{});
}

test "document text HX source axis refuses stale text forged anchors split scalars and object crossing" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.SourceBindingMismatch, map(a, "a" ++ object ++ "b", "ab", &.{0}, &.{}));
    try std.testing.expectError(error.SourceBindingMismatch, map(a, "a" ++ object ++ "b", "ax", &.{1}, &.{}));
    try std.testing.expectError(error.SourceBindingMismatch, map(a, object ++ object, "", &.{ 0, 0 }, &.{}));
    try std.testing.expectError(error.SourceBindingMismatch, map(a, object ++ object, "", &.{ 1, 0 }, &.{}));
    try std.testing.expectError(error.SourceBindingMismatch, map(a, "ab", "a", &.{std.math.maxInt(u32)}, &.{}));
    try std.testing.expectError(error.SplitSurrogatePair, map(a, "😀" ++ object, "😀", &.{2}, &.{
        .{ .start = 1, .end = 2, .text = "x", .expected = "a" },
    }));
    try std.testing.expectError(error.ProtectedPendingObjectBoundary, map(a, "a" ++ object ++ "b", "ab", &.{1}, &.{
        .{ .start = 0, .end = 3, .text = "", .expected = "a" ++ object ++ "b" },
    }));
    try std.testing.expectError(error.AmbiguousPendingAnchorBoundary, map(a, "a" ++ object ++ "b", "ab", &.{1}, &.{
        .{ .start = 2, .end = 2, .text = "x", .expected = "" },
    }));
    try std.testing.expectError(error.ExpectedTextMismatch, map(a, "a" ++ object ++ "b", "ab", &.{1}, &.{
        .{ .start = 0, .end = 1, .text = "x", .expected = "a" },
        .{ .start = 2, .end = 3, .text = "y", .expected = "z" },
    }));
}

/// Read inverse only. A display point at a removed pending object has two
/// possible source sides; no unproven affinity is guessed or issued as authority.
pub fn unprojectPoint(observed: []const u8, current: []const u8, anchors: []const u32, unit: u32) !u32 {
    _ = try verify(observed, current, anchors);
    var cursor: Cursor = .{ .text = current };
    _ = try cursor.seek(unit);
    var removed: u32 = 0;
    for (anchors) |anchor| {
        const projected = anchor - removed;
        if (projected == unit) return error.AmbiguousPendingAnchorBoundary;
        if (projected > unit) break;
        removed += 1;
    }
    return std.math.add(u32, unit, removed) catch error.LimitExceeded;
}
