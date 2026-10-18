//! Shared ASCII result-format syntax; rendering and rounding are separate.
const std = @import("std");

pub const Kind = enum { general, fixed };
pub const Format = struct {
    kind: Kind,
    precision: ?u8,
    grouping: bool,
};

pub fn parse(source: []const u8) !Format {
    if (source.len > 64) return error.LimitExceeded;
    if (source.len < 2 or source[0] != '%') return error.InvalidCalculationResultFormat;
    var index: usize = 1;
    var precision: ?u8 = null;
    if (source[index] == '.') {
        index += 1;
        const start = index;
        var value: u16 = 0;
        while (index < source.len and std.ascii.isDigit(source[index])) : (index += 1) {
            value = value * 10 + source[index] - '0';
            if (value > 17) return error.UnsupportedCalculationResultPrecision;
        }
        if (index == start) return error.InvalidCalculationResultFormat;
        precision = @intCast(value);
    }
    if (index >= source.len) return error.InvalidCalculationResultFormat;
    const kind: Kind = switch (source[index]) {
        'g' => .general,
        'f' => .fixed,
        else => return error.UnsupportedCalculationResultFormat,
    };
    index += 1;
    const grouping = index < source.len and source[index] == ',';
    if (grouping) index += 1;
    if (index != source.len) return error.InvalidCalculationResultFormat;
    return .{ .kind = kind, .precision = precision, .grouping = grouping };
}

test "HWPX calculation result format syntax and hostile boundaries" {
    try std.testing.expectEqual(Format{ .kind = .general, .precision = null, .grouping = true }, try parse("%g,"));
    try std.testing.expectEqual(Format{ .kind = .fixed, .precision = 2, .grouping = true }, try parse("%.2f,"));
    try std.testing.expectEqual(Format{ .kind = .fixed, .precision = 0, .grouping = false }, try parse("%.0f"));
    try std.testing.expectEqual(@as(?u8, 17), (try parse("%.17g")).precision);
    for ([_][]const u8{ "", "%", "%.f", "%.2", "%g,,", "%g suffix", " %g", "%g\x00" }) |source| {
        try std.testing.expectError(error.InvalidCalculationResultFormat, parse(source));
    }
    for ([_][]const u8{ "%e", "%G", "%10f", "%+f", "%*f" }) |source| {
        try std.testing.expectError(error.UnsupportedCalculationResultFormat, parse(source));
    }
    try std.testing.expectError(error.UnsupportedCalculationResultPrecision, parse("%.18f"));
    try std.testing.expectError(error.UnsupportedCalculationResultPrecision, parse("%.999999999999999999f"));
    const oversized = @as([65]u8, @splat('0'));
    try std.testing.expectError(error.LimitExceeded, parse(&oversized));
}
