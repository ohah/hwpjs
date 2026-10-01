//! Bounded observed numeric cell text. No locale guessing or silent zero.
const std = @import("std");
pub fn parse(bytes: []const u8) !f64 {
    if (bytes.len % 2 != 0) return error.UnexpectedEnd;
    if (bytes.len / 2 > 128) return error.LimitExceeded;
    var ascii: [128]u8 = undefined;
    var length: usize = 0;
    var group: usize = 0;
    var grouped = false;
    var decimal = false;
    var fractional: usize = 0;
    var digits: usize = 0;
    for (0..bytes.len / 2) |i| {
        const c = std.mem.readInt(u16, bytes[i * 2 ..][0..2], .little);
        if (i == 0 and (c == '+' or c == '-')) {
            ascii[length] = @intCast(c);
            length += 1;
            continue;
        }
        if (c == ',') {
            if (decimal or group == 0 or (grouped and group != 3) or (!grouped and group > 3)) return error.InvalidFormulaNumber;
            grouped = true;
            group = 0;
            continue;
        }
        if (c == '.') {
            if (decimal or digits == 0 or (grouped and group != 3)) return error.InvalidFormulaNumber;
            decimal = true;
        } else {
            if (c < '0' or c > '9') return error.InvalidFormulaNumber;
            digits += 1;
            if (decimal) fractional += 1 else group += 1;
        }
        ascii[length] = @intCast(c);
        length += 1;
    }
    if (digits == 0 or (decimal and fractional == 0) or (!decimal and grouped and group != 3)) return error.InvalidFormulaNumber;
    const value = std.fmt.parseFloat(f64, ascii[0..length]) catch return error.InvalidFormulaNumber;
    if (!std.math.isFinite(value)) return error.InvalidFormulaNumber;
    return value;
}

fn wire(comptime value: []const u8) [value.len * 2]u8 {
    var bytes: [value.len * 2]u8 = @splat(0);
    for (value, 0..) |c, i| bytes[i * 2] = c;
    return bytes;
}

test "formula numbers parse signed grouped decimals and reject malformed cells" {
    try std.testing.expectEqual(@as(f64, 659100), try parse(&wire("659,100")));
    try std.testing.expectEqual(@as(f64, -1234.5), try parse(&wire("-1,234.50")));
    try std.testing.expectEqual(@as(f64, 0), try parse(&wire("+0")));
    inline for (.{ "", "-", "NaN", "inf", "1e3", "12,34", "1234,567", "1,,000", "1,000,", "1.", ".5", "1.2,3", " 1", "1%" }) |s| {
        try std.testing.expectError(error.InvalidFormulaNumber, parse(&wire(s)));
    }
    try std.testing.expectError(error.UnexpectedEnd, parse(&.{'1'}));
    try std.testing.expectError(error.LimitExceeded, parse(&([_]u8{0} ** 258)));
}
