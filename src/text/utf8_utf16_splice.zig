//! UTF-16 selection coordinates over owned/borrowed UTF-8, without format policy.
const std = @import("std");
const independent = @import("../model/independent_text_edits.zig");

/// One forward cursor over an immutable UTF-8 observation. Work is bounded by
/// the actual text length, independent of the number of requested boundaries.
pub const Cursor = struct {
    text: []const u8,
    offset: usize = 0,
    units: u32 = 0,
    pub fn seek(self: *Cursor, point: u32) !usize {
        if (point < self.units) return error.InvalidTextPosition;
        while (self.units < point) {
            const scalar = (try @import("scalars.zig").read(self.text, self.offset, .utf8)) orelse return error.InvalidTextPosition;
            const width: u32 = if (scalar.value > 0xffff) 2 else 1;
            if (width > point - self.units) return error.SplitSurrogatePair;
            self.units += width;
            self.offset = scalar.end;
        }
        return self.offset;
    }
};

pub fn byteOffset(text: []const u8, point: u32) !usize {
    var cursor: Cursor = .{ .text = text };
    return cursor.seek(point);
}

/// One owned candidate for ordered edits on the original string. Caller owns
/// format/owner admission and commits this together with its whole transaction.
/// Expected text is mandatory; a late mismatch never exposes a partial result.
pub fn replaceMany(a: std.mem.Allocator, text: []const u8, edits: []const independent.Edit, max_bytes: usize, limits: independent.Limits) ![]u8 {
    const units = try independent.utf16Units(text);
    _ = try independent.validate(edits, units, limits);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var cursor: Cursor = .{ .text = text };
    for (edits) |edit| {
        const expected = edit.expected orelse return error.MissingExpectedText;
        const retained = cursor.offset;
        const first = try cursor.seek(edit.start);
        const last = try cursor.seek(edit.end);
        if (!std.mem.eql(u8, text[first..last], expected)) return error.ExpectedTextMismatch;
        const added = std.math.add(usize, first - retained, edit.text.len) catch return error.LimitExceeded;
        if (output.items.len > max_bytes or added > max_bytes - output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, text[retained..first]);
        try output.appendSlice(a, edit.text);
    }
    if (output.items.len > max_bytes or text.len - cursor.offset > max_bytes - output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, text[cursor.offset..]);
    return output.toOwnedSlice(a);
}

pub fn replace(a: std.mem.Allocator, text: []const u8, start: u32, end: u32, inserted: []const u8, limit: usize) ![]u8 {
    if (start > end) return error.InvalidTextPosition;
    if (!std.unicode.utf8ValidateSlice(text) or !std.unicode.utf8ValidateSlice(inserted)) return error.InvalidUnicodeEncoding;
    const first = try byteOffset(text, start);
    const last = try byteOffset(text, end);
    const length = std.math.add(usize, text.len - (last - first), inserted.len) catch return error.LimitExceeded;
    if (length > limit) return error.LimitExceeded;
    const out = try a.alloc(u8, length);
    @memcpy(out[0..first], text[0..first]);
    @memcpy(out[first..][0..inserted.len], inserted);
    @memcpy(out[first + inserted.len ..], text[last..]);
    return out;
}

test "UTF8 splice uses UTF16 scalar positions and handles aliased input and exact budgets" {
    const a = std.testing.allocator;
    const text = "a😀한";
    const output = try replace(a, text, 1, 3, "둘\n", 8);
    defer a.free(output);
    try std.testing.expectEqualStrings("a둘\n한", output);
    try std.testing.expectError(error.LimitExceeded, replace(a, text, 1, 3, "둘\n", 7));
    try std.testing.expectError(error.SplitSurrogatePair, replace(a, text, 2, 3, "", 100));
    try std.testing.expectError(error.SplitSurrogatePair, replace(a, text, 1, 2, "", 100));
    try std.testing.expectError(error.InvalidTextPosition, replace(a, text, 0, 5, "", 100));
    try std.testing.expectError(error.InvalidTextPosition, replace(a, text, 3, 1, "", 100));
    try std.testing.expectError(error.InvalidUnicodeEncoding, replace(a, &.{255}, 0, 0, "", 100));
    try std.testing.expectError(error.InvalidUnicodeEncoding, replace(a, text, 0, 0, &.{255}, 100));
    const aliased = try replace(a, text, 1, 3, text[5..], 100);
    defer a.free(aliased);
    try std.testing.expectEqualStrings("a한한", aliased);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try replace(allocator, "a😀한", 1, 3, "둘\n", 8);
            defer allocator.free(bytes);
            try std.testing.expectEqualStrings("a둘\n한", bytes);
        }
    }.run, .{});
}

fn checkMany(a: std.mem.Allocator) !void {
    const output = try replaceMany(a, "a😀한끝", &.{
        .{ .start = 1, .end = 3, .text = "둘\n", .expected = "😀" },
        .{ .start = 4, .end = 5, .text = "", .expected = "끝" },
        .{ .start = 5, .end = 5, .text = "!", .expected = "" },
    }, 9, .{});
    defer a.free(output);
    try std.testing.expectEqualStrings("a둘\n한!", output);
}
test "document text UTF8 bulk splice owns one candidate and rejects late mismatch or split scalar" {
    const a = std.testing.allocator;
    try checkMany(a);
    try std.testing.checkAllAllocationFailures(a, checkMany, .{});
    try std.testing.expectError(error.ExpectedTextMismatch, replaceMany(a, "abba", &.{
        .{ .start = 0, .end = 1, .text = "X", .expected = "a" },
        .{ .start = 3, .end = 4, .text = "Y", .expected = "z" },
    }, 100, .{}));
    try std.testing.expectError(error.SplitSurrogatePair, replaceMany(a, "😀", &.{
        .{ .start = 1, .end = 1, .text = "", .expected = "" },
    }, 100, .{}));
    try std.testing.expectError(error.MissingExpectedText, replaceMany(a, "a", &.{
        .{ .start = 0, .end = 1, .text = "X" },
    }, 100, .{}));
}
