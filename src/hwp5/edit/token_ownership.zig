//! Owned paragraph tokens from already decoded UTF-16 text; no edit policy.
const std = @import("std");
const model = @import("../../model/document.zig");

/// Validate current metadata against the same canonical decoder used to own it.
pub fn validate(p: model.Paragraph, bytes: []const u8) !void {
    if (!p.text_present or p.declared_units != bytes.len / 2) return error.SourceBindingMismatch;
    const text = try @import("../body/text.zig").Text.parse(bytes);
    var iterator = text.tokens();
    for (p.tokens) |actual| {
        const expected = (try iterator.next()) orelse return error.SourceBindingMismatch;
        const kind: @FieldType(model.Token, "kind") = if (expected.value == .text) .text else .control;
        if (expected.start_unit != actual.start_unit or kind != actual.kind or actual.encoding != .utf16le or !std.mem.eql(u8, expected.raw, actual.raw)) return error.SourceBindingMismatch;
    }
    if (try iterator.next() != null) return error.SourceBindingMismatch;
}

pub fn fromText(a: std.mem.Allocator, bytes: []const u8) ![]model.Token {
    const text = try @import("../body/text.zig").Text.parse(bytes);
    var tokens: std.ArrayList(model.Token) = .empty;
    errdefer {
        for (tokens.items) |token| a.free(token.raw);
        tokens.deinit(a);
    }
    var iterator = text.tokens();
    while (try iterator.next()) |token| {
        const raw = try a.dupe(u8, token.raw);
        errdefer a.free(raw);
        try tokens.append(a, .{ .start_unit = @intCast(token.start_unit), .kind = if (token.value == .text) .text else .control, .encoding = .utf16le, .raw = raw });
    }
    return tokens.toOwnedSlice(a);
}

test "paragraph token ownership preserves line breaks offsets and independent bytes with every allocation failure" {
    const a = std.testing.allocator;
    var input = [_]u8{ 'A', 0, 10, 0, 0x3d, 0xd8, 0, 0xde, 13, 0 };
    const expected = input;
    const owned = try fromText(a, &input);
    defer {
        for (owned) |token| a.free(token.raw);
        a.free(owned);
    }
    try std.testing.expectEqual(@as(usize, 4), owned.len);
    for (owned, [_]u32{ 0, 1, 2, 4 }) |token, unit| try std.testing.expectEqual(unit, token.start_unit);
    try std.testing.expectEqual(.control, owned[1].kind);
    @memset(&input, 0);
    try std.testing.expectEqualSlices(u8, expected[2..4], owned[1].raw);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const tokens = try fromText(allocator, bytes);
            defer {
                for (tokens) |token| allocator.free(token.raw);
                allocator.free(tokens);
            }
            try std.testing.expectEqual(@as(usize, 4), tokens.len);
        }
    }.run, .{@as([]const u8, &expected)});
    try std.testing.expectError(error.InvalidTextSize, fromText(a, &.{13}));
}
