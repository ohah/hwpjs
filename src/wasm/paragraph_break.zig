//! Optional paragraph-flow ABI encoding, shared by both document adapters.
const Kind = @import("../model/paragraph_break.zig").Kind;

pub fn decode(value: u32) !Kind {
    return switch (value) {
        1 => .page,
        2 => .column,
        else => error.InvalidParagraphBreakKind,
    };
}

test "paragraph break ABI accepts only explicit page and column tags" {
    const std = @import("std");
    try std.testing.expectEqual(Kind.page, try decode(1));
    try std.testing.expectEqual(Kind.column, try decode(2));
    for ([_]u32{ 0, 3, 4, 255, 65535, std.math.maxInt(u32) }) |value| {
        try std.testing.expectError(error.InvalidParagraphBreakKind, decode(value));
    }
}
