//! Explicit output policy for observed %g/%.2f, not arbitrary printf execution.
const std = @import("std");
pub const Grouping = @import("../../model/document.zig").NumberGrouping;
pub const Format = enum {
    general6,
    fixed2,

    pub fn parse(bytes: []const u8) !Format {
        if (std.mem.eql(u8, bytes, &.{ '%', 0, 'g', 0 })) return .general6;
        if (std.mem.eql(u8, bytes, &.{ '%', 0, '.', 0, '2', 0, 'f', 0 })) return .fixed2;
        return error.UnsupportedFormulaFormat;
    }

    pub fn render(self: Format, a: std.mem.Allocator, value: f64, grouping: Grouping) ![]u8 {
        if (!std.math.isFinite(value)) return error.InvalidFormulaNumber;
        return @import("../../model/calculation_result_text.zig").render(a, value, .{
            .kind = if (self == .fixed2) .fixed else .general,
            .precision = if (self == .fixed2) 2 else 6,
            .grouping = grouping == .thousands,
        });
    }
};

test "formula formats render fixed decimals significant digits and explicit grouping" {
    const a = std.testing.allocator;
    const Case = struct { format: Format, value: f64, grouping: Grouping = .none, expected: []const u8 };
    for ([_]Case{
        .{ .format = .general6, .value = 67.5, .expected = "67.5" },
        .{ .format = .fixed2, .value = 266, .expected = "266.00" },
        .{ .format = .general6, .value = 659100, .grouping = .thousands, .expected = "659,100" },
        .{ .format = .general6, .value = 999999.9, .expected = "1e+06" },
        .{ .format = .general6, .value = 0.00001, .expected = "1e-05" },
        .{ .format = .general6, .value = 0, .expected = "0" },
        .{ .format = .fixed2, .value = -1234.5, .grouping = .thousands, .expected = "-1,234.50" },
    }) |case| {
        const bytes = try case.format.render(a, case.value, case.grouping);
        defer a.free(bytes);
        try std.testing.expectEqualStrings(case.expected, bytes);
    }
    try std.testing.expectError(error.InvalidFormulaNumber, Format.general6.render(a, std.math.inf(f64), .none));
    try std.testing.expectError(error.UnsupportedFormulaFormat, Format.parse(&.{ '%', 0, 'n', 0 }));
}
