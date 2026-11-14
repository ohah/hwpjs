//! Authored 2-D clustered column data. Product limits, not schema limits.
//! Clean-room-first: ECMA-376 chart vocabulary and hwpjs-owned validators only.
const std = @import("std");
pub const Series = struct { name: []const u8, values: []const []const u8 };
pub const Data = struct { categories: []const []const u8, series: []const Series };
pub const max_categories = 4096;
pub const max_series = 64;
pub const max_points = 16384;
pub const max_text_bytes = 4096;
pub const max_input_bytes = 4 * 1024 * 1024;
pub const max_xml_bytes = 8 * 1024 * 1024;

pub fn validate(data: Data) !void {
    if (data.categories.len == 0 or data.categories.len > max_categories or data.series.len == 0 or data.series.len > max_series) return error.InvalidChartCreateShape;
    if (data.series.len > max_points / data.categories.len) return error.LimitExceeded;
    var remaining: usize = max_input_bytes;
    for (data.categories) |category| try text(category, &remaining);
    for (data.series) |series| {
        try text(series.name, &remaining);
        if (series.values.len != data.categories.len) return error.InvalidChartCreateShape;
        for (series.values) |value| {
            if (value.len == 0 or value.len > 128) return error.InvalidChartNumericValue;
            // Existing common point writer owns finite numeric lexical policy.
            try @import("chart_point_write.zig").validateNumeric(value);
            try charge(value.len, &remaining);
        }
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
