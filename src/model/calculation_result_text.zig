//! Shared bounded result rendering; owns no XML, cache, or editor state.
const std = @import("std");
const formats = @import("calculation_result_format.zig");

pub fn render(a: std.mem.Allocator, value: f64, format: formats.Format) ![]u8 {
    if (!std.math.isFinite(value)) return error.InvalidCalculationCellValue;
    if (format.precision) |p| if (p > 17) return error.UnsupportedCalculationResultPrecision;
    var buffer: [512]u8 = undefined;
    var text: []const u8 = undefined;
    const implicit_grouped = format.kind == .general and format.grouping and format.precision == null;
    if (implicit_grouped and value == @trunc(value)) {
        // Observed grouped integer results preserve all integer positions.
        // This does not change significant-digit policy for fractional values.
        text = try std.fmt.float.render(&buffer, value, .{ .mode = .decimal, .precision = 0 });
    } else if (format.kind == .fixed) {
        text = try std.fmt.float.render(&buffer, value, .{ .mode = .decimal, .precision = format.precision orelse 6 });
    } else {
        const precision: usize = @max(@as(usize, format.precision orelse 6), 1);
        var scientific: [64]u8 = undefined;
        const raw = try std.fmt.float.render(&scientific, value, .{ .mode = .scientific, .precision = precision - 1 });
        const e = std.mem.indexOfScalar(u8, raw, 'e') orelse return error.InvalidCalculationResultText;
        const exponent = try std.fmt.parseInt(i32, raw[e + 1 ..], 10);
        const negative = raw[0] == '-';
        const start: usize = @intFromBool(negative);
        var digits: [18]u8 = undefined;
        var count: usize = 0;
        for (raw[start..e]) |char| if (char != '.') {
            digits[count] = char;
            count += 1;
        };
        while (count > 1 and digits[count - 1] == '0') count -= 1;
        var used: usize = 0;
        if (negative) {
            buffer[used] = '-';
            used += 1;
        }
        if (exponent < -4 or (!implicit_grouped and exponent >= precision)) {
            buffer[used] = digits[0];
            used += 1;
            if (count > 1) {
                buffer[used] = '.';
                used += 1;
                @memcpy(buffer[used..][0 .. count - 1], digits[1..count]);
                used += count - 1;
            }
            buffer[used] = 'e';
            used += 1;
            buffer[used] = if (exponent < 0) '-' else '+';
            used += 1;
            const abs: u32 = @intCast(if (exponent < 0) -exponent else exponent);
            if (abs < 10) {
                buffer[used] = '0';
                used += 1;
            }
            const tail = try std.fmt.bufPrint(buffer[used..], "{d}", .{abs});
            used += tail.len;
        } else {
            const point = exponent + 1;
            if (point <= 0) {
                buffer[used] = '0';
                buffer[used + 1] = '.';
                used += 2;
                for (0..@intCast(-point)) |_| {
                    buffer[used] = '0';
                    used += 1;
                }
                @memcpy(buffer[used..][0..count], digits[0..count]);
                used += count;
            } else {
                const integer: usize = @intCast(point);
                for (0..@max(integer, count)) |i| {
                    if (i == integer) {
                        buffer[used] = '.';
                        used += 1;
                    }
                    buffer[used] = if (i < count) digits[i] else '0';
                    used += 1;
                }
            }
        }
        text = buffer[0..used];
    }
    const start: usize = @intFromBool(text[0] == '-');
    var end = start;
    while (end < text.len and std.ascii.isDigit(text[end])) end += 1;
    const groups = if (format.grouping) (end - start - 1) / 3 else 0;
    const output = try a.alloc(u8, text.len + groups);
    var used: usize = 0;
    for (text, 0..) |char, index| {
        if (format.grouping and index > start and index < end and (end - index) % 3 == 0) {
            output[used] = ',';
            used += 1;
        }
        output[used] = char;
        used += 1;
    }
    return output;
}

fn check(a: std.mem.Allocator, value: f64, source: []const u8, expected: []const u8) !void {
    const text = try render(a, value, try formats.parse(source));
    defer a.free(text);
    try std.testing.expectEqualStrings(expected, text);
}

test "HWPX calculation result text grouping precision and rounding boundaries" {
    const a = std.testing.allocator;
    try check(a, 659100, "%g,", "659,100");
    try check(a, 266, "%.2f,", "266.00");
    try check(a, -1234.5, "%.2f,", "-1,234.50");
    try check(a, 999999.9, "%g,", "1,000,000");
    try check(a, 1000000, "%g,", "1,000,000");
    try check(a, 1749831, "%g,", "1,749,831");
    try check(a, 1000000, "%.6g,", "1e+06");
    try check(a, -1749831.25, "%g,", "-1,749,830");
    try check(a, 68991.2496, "%g,", "68,991.2");
    try check(a, 9007199254740991, "%g,", "9,007,199,254,740,991");
    try check(a, -9007199254740991, "%g,", "-9,007,199,254,740,991");
    try check(a, -0.0, "%g,", "-0");
    try check(a, 0.1 + 0.2, "%g,", "0.3");
    try check(a, 0.0001, "%g", "0.0001");
    try check(a, 0.00001, "%g", "1e-05");
    try check(a, 9.5, "%.0g", "1e+01");
    try check(a, -0.0, "%.2f", "-0.00");
    try check(a, 1.25, "%.1f", "1.3");
    try check(a, -1.25, "%.1f", "-1.3");
    try check(a, 1.75, "%.1f", "1.8");
    try check(a, 999.5, "%.0f,", "1,000");
    try check(a, 0, "%g,", "0");
    const largest = try render(a, std.math.floatMax(f64), try formats.parse("%.17g"));
    defer a.free(largest);
    try std.testing.expectEqual(std.math.floatMax(f64), try std.fmt.parseFloat(f64, largest));
    const smallest: f64 = @bitCast(@as(u64, 1));
    const tiny = try render(a, smallest, try formats.parse("%.17g"));
    defer a.free(tiny);
    try std.testing.expectEqual(smallest, try std.fmt.parseFloat(f64, tiny));
    const wide = try render(a, std.math.floatMax(f64), try formats.parse("%.17f,"));
    defer a.free(wide);
    try std.testing.expect(wide.len > 400 and wide.len < 512);
    try std.testing.expectError(error.InvalidCalculationCellValue, render(a, std.math.inf(f64), try formats.parse("%g")));
    try std.testing.checkAllAllocationFailures(a, check, .{ @as(f64, -1234.5), "%.2f,", "-1,234.50" });
    try std.testing.checkAllAllocationFailures(a, check, .{ @as(f64, 999999.9), "%g,", "1,000,000" });
    try std.testing.checkAllAllocationFailures(a, check, .{ @as(f64, 1749831), "%g,", "1,749,831" });
}
