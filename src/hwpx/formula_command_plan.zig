//! Owned validated replacement values, not a session mutation or evaluator.
const std = @import("std");
const params = @import("formula_parameters.zig");
pub const Plan = struct {
    command: []u8,
    formula: []u8,
    display: []u8,
    parsed: @import("formula_expression.zig").Parsed,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.command);
        a.free(self.formula);
        a.free(self.display);
        self.* = undefined;
    }
};

/// Evaluated value must belong to the replacement expression; caller owns that proof.
pub fn prepare(a: std.mem.Allocator, source: params.View, replacement: []const u8, value: f64) !Plan {
    _ = try @import("formula_expression.zig").parse(a, source);
    if (replacement.len > 4096 or !std.unicode.utf8ValidateSlice(replacement)) return error.InvalidFormulaReplacement;
    if (!std.math.isFinite(value)) return error.InvalidFormulaResult;
    const format = source.result_format orelse return error.MissingFormulaResultFormat;
    const draft = try std.mem.concat(a, u8, &.{ replacement, "??", format, ";;" });
    defer a.free(draft);
    const candidate: params.View = .{ .command = draft, .formula = replacement, .result_format = format };
    const parsed = try @import("formula_expression.zig").parse(a, candidate);
    const display = try @import("formula_output.zig").render(a, parsed, candidate, value);
    errdefer a.free(display);
    const command = try std.mem.concat(a, u8, &.{ draft, display });
    errdefer a.free(command);
    const formula = try a.dupe(u8, replacement);
    return .{ .command = command, .formula = formula, .display = display, .parsed = parsed };
}

fn allocationCase(a: std.mem.Allocator) !void {
    var plan = try prepare(a, .{ .command = "=SUM(B?:E?)??%.2f,;;stale", .formula = "=SUM(B?:E?)", .result_format = "%.2f," }, "=AVG(B?:E?)", 1234.5);
    defer plan.deinit(a);
    try std.testing.expectEqualStrings("=AVG(B?:E?)??%.2f,;;1,234.50", plan.command);
    try std.testing.expectEqualStrings("=AVG(B?:E?)", plan.formula);
    try std.testing.expectEqualStrings("1,234.50", plan.display);
}

test "HWPX formula command plan shares grammar format and allocation cleanup" {
    const a = std.testing.allocator;
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
    const source: params.View = .{ .command = "=SUM(A1:A2)??%g,;;1", .formula = "=SUM(A1:A2)", .result_format = "%g," };
    var product = try prepare(std.testing.allocator, source, "=PRODUCT(A1:A2)", 14);
    defer product.deinit(std.testing.allocator);
    try std.testing.expectEqualStrings("=PRODUCT(A1:A2)??%g,;;14", product.command);
    var maximum = try prepare(a, source, "=MAX(A1:A2)", 1);
    defer maximum.deinit(a);
    try std.testing.expectEqualStrings("=MAX(A1:A2)??%g,;;1", maximum.command);
    try std.testing.expectEqual(.maximum, maximum.parsed.range.function);
    try std.testing.expectError(error.UnsupportedFormulaExpression, prepare(a, source, "=MEDIAN(A1:A2)", 1));
    try std.testing.expectError(error.InvalidFormulaReplacement, prepare(std.testing.allocator, source, &.{0xff}, 1));
    try std.testing.expectError(error.InvalidFormulaResult, prepare(std.testing.allocator, source, "=SUM(A1:A2)", std.math.inf(f64)));
}
