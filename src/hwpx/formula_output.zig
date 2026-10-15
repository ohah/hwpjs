//! Observed ResultFormat adapter; numerical rendering remains shared.
const std = @import("std");
const format_mod = @import("../hwp5/body/formula_format.zig");

pub fn render(a: std.mem.Allocator, parsed: @import("formula_expression.zig").Parsed, view: @import("formula_parameters.zig").View, value: f64) ![]u8 {
    const raw = view.result_format orelse return error.MissingFormulaResultFormat;
    const policy: struct { format: format_mod.Format, grouping: format_mod.Grouping } = if (std.mem.eql(u8, raw, "%g,")) .{ .format = .general6, .grouping = .thousands } else if (std.mem.eql(u8, raw, "%.2f,")) .{ .format = .fixed2, .grouping = .thousands } else if (std.mem.eql(u8, raw, "%g")) .{ .format = .general6, .grouping = .none } else if (std.mem.eql(u8, raw, "%.2f")) .{ .format = .fixed2, .grouping = .none } else return error.UnsupportedFormulaResultFormat;
    if (policy.format != parsed.format) return error.FormulaResultFormatMismatch;
    if (policy.format == .general6 and policy.grouping == .thousands and std.math.isFinite(value) and value == @trunc(value)) {
        // Observed HWPX implicit grouped integers retain every integer digit.
        // Keep explicit HWP5 general6 and fractional formatting unchanged.
        return @import("../model/calculation_result_text.zig").render(a, value, .{ .kind = .fixed, .precision = 0, .grouping = true });
    }
    return parsed.format.render(a, value, policy.grouping);
}

test "HWPX grouped integer results preserve digits without changing explicit general format" {
    const a = std.testing.allocator;
    const Case = struct { raw: []const u8, value: f64, expected: []const u8 };
    for ([_]Case{
        .{ .raw = "%g,", .value = 1000000, .expected = "1,000,000" },
        .{ .raw = "%g,", .value = 1749831, .expected = "1,749,831" },
        .{ .raw = "%g,", .value = -1749831, .expected = "-1,749,831" },
        .{ .raw = "%g,", .value = 68991.2496, .expected = "68,991.2" },
        .{ .raw = "%g,", .value = -0.0, .expected = "-0" },
        .{ .raw = "%g", .value = 1000000, .expected = "1e+06" },
        .{ .raw = "%.2f,", .value = 1000000, .expected = "1,000,000.00" },
    }) |case| {
        const command = try std.fmt.allocPrint(a, "=SUM(A1:A2)??{s},;;stale", .{std.mem.trimEnd(u8, case.raw, ",")});
        defer a.free(command);
        const view: @import("formula_parameters.zig").View = .{ .command = command, .formula = "=SUM(A1:A2)", .result_format = case.raw };
        const parsed = try @import("formula_expression.zig").parse(a, view);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, p: @import("formula_expression.zig").Parsed, v: @import("formula_parameters.zig").View, value: f64, expected: []const u8) !void {
                const text = try render(allocator, p, v, value);
                defer allocator.free(text);
                try std.testing.expectEqualStrings(expected, text);
            }
        }.run, .{ parsed, view, case.value, case.expected });
        try std.testing.expectError(error.InvalidFormulaNumber, render(a, parsed, view, std.math.inf(f64)));
        try std.testing.expectError(error.InvalidFormulaNumber, render(a, parsed, view, std.math.nan(f64)));
    }
    const explicit = try format_mod.Format.general6.render(a, 1000000, .thousands);
    defer a.free(explicit);
    try std.testing.expectEqualStrings("1e+06", explicit);
}

test "HWPX formula output shares rendering and rejects divergent result format" {
    const a = std.testing.allocator;
    const view: @import("formula_parameters.zig").View = .{ .command = "=SUM(A1:A2)??%g,;;stale", .formula = "=SUM(A1:A2)", .result_format = "%g," };
    const parsed = try @import("formula_expression.zig").parse(a, view);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, p: @import("formula_expression.zig").Parsed, v: @import("formula_parameters.zig").View) !void {
            const output = try render(allocator, p, v, 659100);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("659,100", output);
        }
    }.run, .{ parsed, view });
    var changed = view;
    changed.result_format = "%.2f,";
    try std.testing.expectError(error.FormulaResultFormatMismatch, render(a, parsed, changed, 1));
    changed.result_format = "%s";
    try std.testing.expectError(error.UnsupportedFormulaResultFormat, render(a, parsed, changed, 1));
    changed.result_format = null;
    try std.testing.expectError(error.MissingFormulaResultFormat, render(a, parsed, changed, 1));
}
