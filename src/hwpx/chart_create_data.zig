//! Authored chart data. Product limits, not schema limits.
//! Clean-room-first: ECMA-376 chart vocabulary and hwpjs-owned validators only.
const std = @import("std");
const profile = @import("chart_create_profile.zig");
const decimal = @import("chart_create_decimal.zig");
pub const Series = struct {
    name: []const u8,
    values: []const []const u8,
    x_values: ?[]const []const u8 = null,
    bubble_sizes: ?[]const []const u8 = null,
    stock_role: ?profile.StockRole = null,
};
pub const Data = struct { categories: []const []const u8, series: []const Series };
pub const max_categories = 4096;
pub const max_series = 64;
pub const max_points = 16384;
pub const max_text_bytes = 4096;
pub const max_input_bytes = 4 * 1024 * 1024;
pub const max_xml_bytes = 8 * 1024 * 1024;

pub fn validate(data: Data) !void {
    return validateFor(data, null);
}

pub fn validateFor(data: Data, chart: ?profile.Profile) !void {
    if (chart) |p| try profile.validate(p);
    const kind = if (chart) |p| p.kind else .barChart;
    const xy = profile.isXY(kind);
    if (data.categories.len > max_categories or data.series.len == 0 or data.series.len > max_series) return error.InvalidChartCreateShape;
    if ((xy and data.categories.len != 0) or (!xy and data.categories.len == 0)) return error.InvalidChartCreateShape;
    if (profile.isPie(kind) and kind != .doughnutChart and data.series.len != 1) return error.InvalidChartCreateShape;
    if (profile.isSurface(kind) and (data.categories.len < 2 or data.series.len < 2)) return error.InvalidChartCreateShape;
    const stock_roles: []const profile.StockRole = if (chart != null and chart.?.stock_layout == .openHighLowClose) &.{ .open, .high, .low, .close } else &.{ .high, .low, .close };
    if (kind == .stockChart and data.series.len != stock_roles.len) return error.InvalidChartCreateShape;
    var remaining: usize = max_input_bytes;
    var points: usize = 0;
    for (data.categories) |category| try text(category, &remaining);
    for (data.series, 0..) |series, ordinal| {
        try text(series.name, &remaining);
        const count = series.values.len;
        if (count == 0 or count > max_categories or (!xy and count != data.categories.len)) return error.InvalidChartCreateShape;
        // Preserve legacy admission limits; explicit profiles charge all caches.
        const multiplier: usize = if (chart == null) 1 else if (kind == .bubbleChart) 3 else 2;
        if (count > (max_points -| points) / multiplier) return error.LimitExceeded;
        points += count * multiplier;
        if ((series.x_values != null) != xy or (series.bubble_sizes != null) != (kind == .bubbleChart) or (series.stock_role != null) != (kind == .stockChart)) return error.InvalidChartCreateShape;
        if (kind == .stockChart and series.stock_role.? != stock_roles[ordinal]) return error.InvalidChartCreateShape;
        try numbers(series.values, count, &remaining, profile.isPie(kind), chart != null);
        if (series.x_values) |values| try numbers(values, count, &remaining, false, true);
        if (series.bubble_sizes) |values| try numbers(values, count, &remaining, true, true);
    }
    if (kind == .stockChart) {
        const offset: usize = if (data.series.len == 4) 1 else 0;
        for (0..data.categories.len) |index| {
            const high = data.series[offset].values[index];
            const low = data.series[offset + 1].values[index];
            const close = data.series[offset + 2].values[index];
            if ((try decimal.compare(low, high)) == .gt or (try decimal.compare(close, low)) == .lt or (try decimal.compare(close, high)) == .gt) return error.InvalidChartStockValues;
            if (offset == 1) {
                const open = data.series[0].values[index];
                if ((try decimal.compare(open, low)) == .lt or (try decimal.compare(open, high)) == .gt) return error.InvalidChartStockValues;
            }
        }
    }
}

fn numbers(values: []const []const u8, count: usize, remaining: *usize, nonnegative: bool, exact: bool) !void {
    if (values.len != count) return error.InvalidChartCreateShape;
    for (values) |value| {
        if (value.len == 0 or value.len > 128) return error.InvalidChartNumericValue;
        try @import("chart_point_write.zig").validateNumeric(value);
        if (exact) {
            const parsed = try decimal.parse(value);
            if (nonnegative and parsed.negative) return error.InvalidChartNumericValue;
        }
        try charge(value.len, remaining);
    }
}

fn charge(bytes: usize, remaining: *usize) !void {
    if (bytes > remaining.*) return error.LimitExceeded;
    remaining.* -= bytes;
}

fn text(value: []const u8, remaining: *usize) !void {
    if (value.len > max_text_bytes) return error.LimitExceeded;
    if (!std.unicode.utf8ValidateSlice(value)) return error.InvalidUtf8;
    // Restrict v1 to printable XML 1.0 Unicode text. Preserve whitespace and
    // literal _xNNNN_ sequences through the shared ST_Xstring encoder.
    var it = (try std.unicode.Utf8View.init(value)).iterator();
    while (it.nextCodepoint()) |cp| {
        if ((cp < 0x20 and cp != 9 and cp != 10 and cp != 13) or cp == 0xfffe or cp == 0xffff) return error.InvalidChartCreateText;
    }
    try charge(value.len, remaining);
}
