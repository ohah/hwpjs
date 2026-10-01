//! HWPX UTF-8 boundary adapter; expression grammar remains shared with HWP5.
const std = @import("std");
const parameters = @import("formula_parameters.zig");
pub const Parsed = struct {
    range: @import("../hwp5/body/formula_range.zig").Range,
    format: @import("../hwp5/body/formula_format.zig").Format,
};

pub fn parse(a: std.mem.Allocator, view: parameters.View) !Parsed {
    const command = view.command orelse return error.MissingFormulaCommand;
    const formula = view.formula orelse return error.MissingFormulaExpression;
    const command_wire = try std.unicode.utf8ToUtf16LeAlloc(a, command);
    defer a.free(command_wire);
    const expression_wire = try std.unicode.utf8ToUtf16LeAlloc(a, formula);
    defer a.free(expression_wire);
    const envelope = try @import("../hwp5/body/formula_command.zig").View.parse(std.mem.sliceAsBytes(command_wire));
    const expression_bytes = std.mem.sliceAsBytes(expression_wire);
    if (expression_bytes.len < 2 or !std.mem.eql(u8, expression_bytes[0..2], &.{ '=', 0 }) or !std.mem.eql(u8, expression_bytes[2..], envelope.expression)) return error.FormulaExpressionMismatch;
    return .{ .range = try envelope.range(), .format = try @import("../hwp5/body/formula_format.zig").Format.parse(envelope.format) };
}

test "HWPX formula expression shares grammar without evaluating stale cached results" {
    const a = std.testing.allocator;
    const view: parameters.View = .{ .command = "=SUM(B?:E?)??%g,;;not-a-number", .formula = "=SUM(B?:E?)", .last_result = "also-not-a-number", .result_format = "%g," };
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: parameters.View) !void {
            const result = try parse(allocator, input);
            try std.testing.expectEqual(@import("../hwp5/body/formula_range.zig").Function.sum, result.range.function);
            try std.testing.expectEqual(@import("../hwp5/body/formula_format.zig").Format.general6, result.format);
        }
    }.run, .{view});
    const avg = try parse(a, .{ .command = "=AVG(?2:?4)??%.2f,;;266", .formula = "=AVG(?2:?4)" });
    try std.testing.expectEqual(@import("../hwp5/body/formula_range.zig").Function.average, avg.range.function);
}

test "HWPX formula expression rejects missing divergent and unsupported definitions" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.MissingFormulaCommand, parse(a, .{ .formula = "=SUM(A1:A2)" }));
    try std.testing.expectError(error.MissingFormulaExpression, parse(a, .{ .command = "=SUM(A1:A2)??%g,;;1" }));
    try std.testing.expectError(error.FormulaExpressionMismatch, parse(a, .{ .command = "=SUM(A1:A2)??%g,;;1", .formula = "=SUM(B1:B2)" }));
    try std.testing.expectError(error.UnsupportedFormulaExpression, parse(a, .{ .command = "=PRODUCT(A1:A2)??%g,;;1", .formula = "=PRODUCT(A1:A2)" }));
    try std.testing.expectError(error.UnsupportedFormulaFormat, parse(a, .{ .command = "=SUM(A1:A2)??%s,;;1", .formula = "=SUM(A1:A2)" }));
}
