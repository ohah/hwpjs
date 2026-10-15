//! Generated-cell text: semantic LF elements inside hp:t, not XML whitespace.
const std = @import("std");

pub fn encode(a: std.mem.Allocator, text: []const u8, limit: usize) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var lines = std.mem.splitScalar(u8, text, '\n');
    var first = true;
    while (lines.next()) |line| {
        if (!first) {
            const marker = "<hp:lineBreak/>";
            if (marker.len > limit -| output.items.len) return error.LimitExceeded;
            try output.appendSlice(a, marker);
        }
        first = false;
        const escaped = try @import("../xml/text_writer.zig").encode(a, line, limit -| output.items.len);
        defer a.free(escaped);
        try output.appendSlice(a, escaped);
    }
    return output.toOwnedSlice(a);
}
