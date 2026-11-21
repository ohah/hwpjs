//! Tight own 2D pie creation admission, not a read-time XML default.
//! Source: hwpjs chart-absolute-total.mjs + chart-circular-intervals.mjs.
//! Match their forward two-pass binary64 arithmetic with explicit strict mode.
//! Exact decimal nonzero -> binary64 zero is refused, never silently erased.
//! This is not a proof of all cross-language decimal parsing/rounding cases;
//! normal package/Worker differential tests must qualify the final engine.
const std = @import("std");
const decimal = @import("../../hwpx/chart_create_decimal.zig");
const max_values = @import("../../hwpx/chart_create_data.zig").max_categories;
pub fn validate(raw: []const []const u8) !void {
    @setFloatMode(.strict);
    if (raw.len == 0 or raw.len > max_values) return error.InvalidChartCreateShape;
    var numbers: [max_values]f64 = undefined;
    var magnitude: f64 = 0;
    for (raw, 0..) |text, i| {
        const exact = try decimal.parse(text);
        const value = std.fmt.parseFloat(f64, text) catch return error.InvalidChartNumericValue;
        if (exact.negative or !std.math.isFinite(value) or value < 0) return error.InvalidChartNumericValue;
        if (exact.len != 0 and value == 0) return error.UnrepresentablePieShare;
        numbers[i] = value;
        magnitude = @max(magnitude, value);
    }
    if (magnitude == 0) return error.EmptyPieMagnitude;
    var scaled: f64 = 0;
    for (numbers[0..raw.len]) |value| scaled += value / magnitude;
    if (!std.math.isFinite(scaled) or scaled <= 0) return error.UnrepresentablePieShare;
    const pi: f64 = std.math.pi;
    const origin: f64 = -pi / 2.0;
    var sum: f64 = 0;
    var previous: f64 = 0;
    for (numbers[0..raw.len]) |value| {
        const start = previous;
        sum += value / magnitude;
        const end = sum / scaled;
        const first = origin + (start * 2.0) * pi;
        const last = origin + (end * 2.0) * pi;
        const share = (value / magnitude) / scaled;
        if (!std.math.isFinite(end) or !std.math.isFinite(first) or !std.math.isFinite(last) or start < 0 or end > 1 or end < start)
            return error.UnrepresentablePieShare;
        if (value > 0 and (share == 0 or end <= start or last <= first)) return error.UnrepresentablePieShare;
        previous = end;
    }
}
