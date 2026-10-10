//! Explicit ASCII numeric-cell policy; no locale guessing or blank-as-zero.
const std = @import("std");
pub fn parse(input: []const u8) !f64 {
    if (input.len > 1024) return error.LimitExceeded;
    const text = std.mem.trim(u8, input, " \t\r\n");
    if (text.len == 0) return error.MissingCalculationCellValue;
    var output: [1024]u8 = undefined;
    var used: usize = 0;
    var index: usize = 0;
    if (text[index] == '+' or text[index] == '-') {
        output[used] = text[index];
        used += 1;
        index += 1;
    }
    var digits: usize = 0;
    var group: usize = 0;
    var grouped = false;
    while (index < text.len and (std.ascii.isDigit(text[index]) or text[index] == ',')) : (index += 1) {
        const char = text[index];
        if (char == ',') {
            if (group == 0 or (!grouped and group > 3) or (grouped and group != 3)) return error.InvalidCalculationNumericText;
            grouped = true;
            group = 0;
        } else {
            output[used] = char;
            used += 1;
            digits += 1;
            group += 1;
        }
    }
    if (grouped and group != 3) return error.InvalidCalculationNumericText;
    if (index < text.len and text[index] == '.') {
        output[used] = '.';
        used += 1;
        index += 1;
        while (index < text.len and std.ascii.isDigit(text[index])) : (index += 1) {
            output[used] = text[index];
            used += 1;
            digits += 1;
        }
    }
    if (digits == 0) return error.InvalidCalculationNumericText;
    if (index < text.len and (text[index] == 'e' or text[index] == 'E')) {
        output[used] = text[index];
        used += 1;
        index += 1;
        if (index < text.len and (text[index] == '+' or text[index] == '-')) {
            output[used] = text[index];
            used += 1;
            index += 1;
        }
        const first = index;
        while (index < text.len and std.ascii.isDigit(text[index])) : (index += 1) {
            output[used] = text[index];
            used += 1;
        }
        if (index == first) return error.InvalidCalculationNumericText;
    }
    if (index != text.len) return error.InvalidCalculationNumericText;
    const value = std.fmt.parseFloat(f64, output[0..used]) catch return error.InvalidCalculationNumericText;
    if (!std.math.isFinite(value)) return error.InvalidCalculationCellValue;
    return value;
}

test "HWPX calculation numeric text validates grouping signs decimals and exponents" {
    try std.testing.expectEqual(@as(f64, 659100), try parse("659,100"));
    try std.testing.expectEqual(@as(f64, 266), try parse("266.00"));
    try std.testing.expectEqual(@as(f64, -1234.5), try parse(" -1,234.50 "));
    try std.testing.expectEqual(@as(f64, 0.5), try parse("+.5"));
    try std.testing.expectEqual(@as(f64, 120000), try parse("1.2e+5"));
    try std.testing.expectError(error.MissingCalculationCellValue, parse(" \n"));
    for ([_][]const u8{ "+", ".", "NaN", "inf", "12,34", "1234,567", "1,,234", "1,234,", "1.2,3", "1e", "1e+", "1 234", "12%", "$12" }) |value| try std.testing.expectError(error.InvalidCalculationNumericText, parse(value));
    try std.testing.expectError(error.InvalidCalculationCellValue, parse("1e999"));
    var oversized: [1025]u8 = @splat('0');
    try std.testing.expectError(error.LimitExceeded, parse(&oversized));
}
