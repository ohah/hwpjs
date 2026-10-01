//! Observed %fmu command envelope, not an expression evaluator.
//! Borrow every component; never treat the cached display as a current result.
const std = @import("std");

pub const View = struct {
    expression: []const u8,
    format: []const u8,
    cached_display: []const u8,

    pub fn range(self: View) !@import("formula_range.zig").Range {
        return @import("formula_range.zig").Range.parse(self.expression);
    }

    pub fn parse(bytes: []const u8) !View {
        if (bytes.len % 2 != 0) return error.UnexpectedEnd;
        if (!matches(bytes, 0, "=")) return error.UnsupportedFormulaCommand;
        const split = find(bytes, 2, "??") orelse return error.UnsupportedFormulaCommand;
        const format_start = split + 4;
        const result_split = find(bytes, format_start, ",;;") orelse return error.UnsupportedFormulaCommand;
        if (split == 2 or result_split == format_start) return error.UnsupportedFormulaCommand;
        return .{
            .expression = bytes[2..split],
            .format = bytes[format_start..result_split],
            .cached_display = bytes[result_split + 6 ..],
        };
    }
};

fn matches(bytes: []const u8, at: usize, ascii: []const u8) bool {
    if (at > bytes.len or ascii.len > (bytes.len - at) / 2) return false;
    for (ascii, 0..) |value, i| {
        if (bytes[at + i * 2] != value or bytes[at + i * 2 + 1] != 0) return false;
    }
    return true;
}

fn find(bytes: []const u8, begin: usize, ascii: []const u8) ?usize {
    var at = begin;
    while (at < bytes.len) : (at += 2) if (matches(bytes, at, ascii)) return at;
    return null;
}

fn wire(comptime ascii: []const u8) [ascii.len * 2]u8 {
    var bytes: [ascii.len * 2]u8 = @splat(0);
    for (ascii, 0..) |value, i| bytes[i * 2] = value;
    return bytes;
}

test "formula command envelope splits observed SUM and AVG without evaluating cached values" {
    const sum = wire("=SUM(B?:E?)??%g,;;67.5");
    const view = try View.parse(&sum);
    try std.testing.expectEqualSlices(u8, &wire("SUM(B?:E?)"), view.expression);
    try std.testing.expectEqualSlices(u8, &wire("%g"), view.format);
    try std.testing.expectEqualSlices(u8, &wire("67.5"), view.cached_display);
    try std.testing.expectEqual(@intFromPtr(&sum) + 2, @intFromPtr(view.expression.ptr));
    const average = wire("=AVG(B?:E?)??%.2f,;;266.00");
    const avg = try View.parse(&average);
    try std.testing.expectEqualSlices(u8, &wire("%.2f"), avg.format);
    const relative = wire("=SUM(?2:?4)??%g,;;245");
    try std.testing.expectEqualSlices(u8, &wire("SUM(?2:?4)"), (try View.parse(&relative)).expression);
    const empty_cache = wire("=SUM(A1:A2)??%g,;;");
    try std.testing.expectEqual(@as(usize, 0), (try View.parse(&empty_cache)).cached_display.len);
}

test "formula command envelope rejects ambiguous structural absence and odd wire bytes" {
    try std.testing.expectError(error.UnexpectedEnd, View.parse(&.{'='}));
    inline for (.{ "", "SUM(A1)", "=??%g,;;1", "=SUM(A1)??,;;1", "=SUM(A1)??%g", "=SUM(A1)" }) |value| {
        try std.testing.expectError(error.UnsupportedFormulaCommand, View.parse(&wire(value)));
    }
}
