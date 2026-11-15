//! Exact bounded decimal sign/order SSOT for authored creation policy.
//! No floating-point conversion. Product bounds: <=128 bytes, explicit exponent
//! magnitude <=10000. Existing finite-f64 admission is checked separately.
const std = @import("std");
pub const max_bytes = 128;
pub const max_exponent = 10000;
pub const Decimal = struct {
    negative: bool,
    digits: [max_bytes]u8,
    len: usize,
    scale: i32,
};
pub fn parse(text: []const u8) !Decimal {
    if (text.len == 0 or text.len > max_bytes) return error.InvalidChartNumericValue;
    var result: Decimal = .{ .negative = text[0] == '-', .digits = @splat('0'), .len = 0, .scale = 0 };
    var at: usize = if (text[0] == '+' or text[0] == '-') 1 else 0;
    var digits: usize = 0;
    var fractional: i32 = 0;
    var dot = false;
    while (at < text.len and text[at] != 'e' and text[at] != 'E') : (at += 1) {
        const byte = text[at];
        if (byte == '.' and !dot) {
            dot = true;
            continue;
        }
        if (byte < '0' or byte > '9') return error.InvalidChartNumericValue;
        digits += 1;
        if (dot) fractional += 1;
        if (result.len != 0 or byte != '0') {
            result.digits[result.len] = byte;
            result.len += 1;
        }
    }
    if (digits == 0) return error.InvalidChartNumericValue;
    var exponent: i32 = 0;
    if (at < text.len) {
        at += 1;
        const negative = at < text.len and text[at] == '-';
        if (at < text.len and (text[at] == '+' or text[at] == '-')) at += 1;
        const start = at;
        while (at < text.len) : (at += 1) {
            const byte = text[at];
            if (byte < '0' or byte > '9') return error.InvalidChartNumericValue;
            const digit: i32 = byte - '0';
            if (exponent > @divTrunc(max_exponent - digit, 10)) return error.InvalidChartNumericValue;
            exponent = exponent * 10 + digit;
        }
        if (at == start) return error.InvalidChartNumericValue;
        if (negative) exponent = -exponent;
    }
    if (result.len == 0) result.negative = false else result.scale = exponent - fractional + @as(i32, @intCast(result.len));
    return result;
}
pub fn compare(left: []const u8, right: []const u8) !std.math.Order {
    const x = try parse(left);
    const y = try parse(right);
    if (x.negative != y.negative) return if (x.negative) .lt else .gt;
    var order: std.math.Order = .eq;
    if (x.len == 0 or y.len == 0) {
        order = std.math.order(x.len, y.len);
    } else if (x.scale != y.scale) {
        order = std.math.order(x.scale, y.scale);
    } else {
        for (0..@max(x.len, y.len)) |i| {
            const xd = if (i < x.len) x.digits[i] else '0';
            const yd = if (i < y.len) y.digits[i] else '0';
            if (xd != yd) {
                order = std.math.order(xd, yd);
                break;
            }
        }
    }
    return if (!x.negative) order else switch (order) {
        .lt => .gt,
        .gt => .lt,
        .eq => .eq,
    };
}
