//! Observed ResultFormat adapter; numerical rendering remains shared.
const std = @import("std");
const format_mod = @import("../hwp5/body/formula_format.zig");

pub fn render(a: std.mem.Allocator, parsed: @import("formula_expression.zig").Parsed, view: @import("formula_parameters.zig").View, value: f64) ![]u8 {
    const raw = view.result_format orelse return error.MissingFormulaResultFormat;
    const policy: struct { format: format_mod.Format, grouping: format_mod.Grouping } = if (std.mem.eql(u8, raw, "%g,")) .{ .format = .general6, .grouping = .thousands } else if (std.mem.eql(u8, raw, "%.2f,")) .{ .format = .fixed2, .grouping = .thousands } else if (std.mem.eql(u8, raw, "%g")) .{ .format = .general6, .grouping = .none } else if (std.mem.eql(u8, raw, "%.2f")) .{ .format = .fixed2, .grouping = .none } else return error.UnsupportedFormulaResultFormat;
    if (policy.format != parsed.format) return error.FormulaResultFormatMismatch;
    return parsed.format.render(a, value, policy.grouping);
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
