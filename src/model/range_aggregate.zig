//! Shared numeric fold only; selection, ownership and display belong to callers.
const std = @import("std");
pub const Function = enum { sum, average, product, minimum, maximum };
pub fn initial(function: Function) f64 {
    return switch (function) {
        .product => 1,
        .minimum => std.math.inf(f64),
        .maximum => -std.math.inf(f64),
        else => 0,
    };
}
pub fn step(function: Function, current: f64, value: f64) !f64 {
    if (!std.math.isFinite(value)) return error.FormulaNumericOverflow;
    const result = switch (function) {
        .product => current * value,
        .minimum => @min(current, value),
        .maximum => @max(current, value),
        else => current + value,
    };
    if (!std.math.isFinite(result)) return error.FormulaNumericOverflow;
    return result;
}
pub fn finish(function: Function, value: f64, count: usize) !f64 {
    if (count == 0) return error.EmptyFormulaRange;
    if (!std.math.isFinite(value)) return error.FormulaNumericOverflow;
    return if (function == .average) value / @as(f64, @floatFromInt(count)) else value;
}
test "range aggregate extrema reject nonfinite values and do not seed with zero" {
    try std.testing.expectEqual(@as(f64, 5), try step(.minimum, try step(.minimum, initial(.minimum), 9), 5));
    try std.testing.expectEqual(@as(f64, -5), try step(.maximum, try step(.maximum, initial(.maximum), -9), -5));
    inline for (.{ Function.minimum, Function.maximum, Function.sum, Function.average, Function.product }) |function| {
        try std.testing.expectError(error.FormulaNumericOverflow, step(function, initial(function), std.math.nan(f64)));
        try std.testing.expectError(error.FormulaNumericOverflow, step(function, initial(function), std.math.inf(f64)));
        try std.testing.expectError(error.EmptyFormulaRange, finish(function, initial(function), 0));
    }
}
