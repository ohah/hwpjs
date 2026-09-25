const std = @import("std");

pub fn nonNegative(raw: []const u8) !bool {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    if (value.len == 0) return error.InvalidNonNegativeInteger;
    var offset: usize = 0;
    var negative = false;
    if (value[0] == '+' or value[0] == '-') {
        negative = value[0] == '-';
        offset = 1;
    }
    if (offset == value.len) return error.InvalidNonNegativeInteger;
    var zero = true;
    for (value[offset..]) |byte| {
        if (byte < '0' or byte > '9') return error.InvalidNonNegativeInteger;
        if (byte != '0') zero = false;
    }
    if (negative and !zero) return error.InvalidNonNegativeInteger;
    return zero;
}

pub fn unsigned32(raw: []const u8) !u32 {
    const zero = try nonNegative(raw);
    if (zero) return 0;
    const value = std.mem.trim(u8, raw, " \t\r\n");
    const digits = if (value[0] == '+') value[1..] else value;
    return std.fmt.parseInt(u32, digits, 10) catch error.InvalidUnsigned32;
}

/// Some HWPX unit fields occur both as negative decimal i32 values and as
/// unsigned 32-bit decimal values. Preserve the lexical numeric value; do not
/// silently reinterpret a high-bit u32 as a negative signed value.
pub fn signedOrUnsigned32(raw: []const u8) !i64 {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    if (value.len == 0) return error.InvalidSignedOrUnsigned32;
    var offset: usize = 0;
    const negative = value[0] == '-';
    if (negative or value[0] == '+') offset = 1;
    if (offset == value.len) return error.InvalidSignedOrUnsigned32;
    for (value[offset..]) |byte| {
        if (byte < '0' or byte > '9') return error.InvalidSignedOrUnsigned32;
    }
    const magnitude = std.fmt.parseInt(u64, value[offset..], 10) catch return error.InvalidSignedOrUnsigned32;
    if (negative) {
        if (magnitude > 0x80000000) return error.InvalidSignedOrUnsigned32;
        return -@as(i64, @intCast(magnitude));
    }
    if (magnitude > 0xFFFFFFFF) return error.InvalidSignedOrUnsigned32;
    return @intCast(magnitude);
}

pub fn boolean(raw: []const u8) !bool {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    if (std.mem.eql(u8, value, "true") or std.mem.eql(u8, value, "1")) return true;
    if (std.mem.eql(u8, value, "false") or std.mem.eql(u8, value, "0")) return false;
    return error.InvalidXmlBoolean;
}

pub fn short(raw: []const u8) !i16 {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    if (value.len == 0) return error.InvalidXmlShort;
    var offset: usize = 0;
    if (value[0] == '+' or value[0] == '-') offset = 1;
    if (offset == value.len) return error.InvalidXmlShort;
    for (value[offset..]) |byte| if (byte < '0' or byte > '9') return error.InvalidXmlShort;
    return std.fmt.parseInt(i16, value, 10) catch error.InvalidXmlShort;
}

pub fn signed32(raw: []const u8) !i32 {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    if (value.len == 0) return error.InvalidXmlSigned32;
    var offset: usize = 0;
    if (value[0] == '+' or value[0] == '-') offset = 1;
    if (offset == value.len) return error.InvalidXmlSigned32;
    for (value[offset..]) |byte| if (byte < '0' or byte > '9') return error.InvalidXmlSigned32;
    return std.fmt.parseInt(i32, value, 10) catch error.InvalidXmlSigned32;
}

/// XML float lexical form only. Numeric interpretation and rendering are
/// separate; INF/-INF/NaN are valid XML Schema float spellings.
pub fn floatLexical(raw: []const u8) !void {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    if (std.mem.eql(u8, value, "INF") or std.mem.eql(u8, value, "-INF") or std.mem.eql(u8, value, "NaN")) return;
    var cursor: usize = 0;
    if (cursor < value.len and (value[cursor] == '+' or value[cursor] == '-')) cursor += 1;
    var digits: usize = 0;
    while (cursor < value.len and std.ascii.isDigit(value[cursor])) : (cursor += 1) digits += 1;
    if (cursor < value.len and value[cursor] == '.') {
        cursor += 1;
        while (cursor < value.len and std.ascii.isDigit(value[cursor])) : (cursor += 1) digits += 1;
    }
    if (digits == 0) return error.InvalidXmlFloat;
    if (cursor < value.len and (value[cursor] == 'e' or value[cursor] == 'E')) {
        cursor += 1;
        if (cursor < value.len and (value[cursor] == '+' or value[cursor] == '-')) cursor += 1;
        const exponent_start = cursor;
        while (cursor < value.len and std.ascii.isDigit(value[cursor])) : (cursor += 1) {}
        if (cursor == exponent_start) return error.InvalidXmlFloat;
    }
    if (cursor != value.len) return error.InvalidXmlFloat;
}

test "HWPX shared XML scalar lexical bounds" {
    try std.testing.expect(try nonNegative(" -000 "));
    try std.testing.expect(!(try nonNegative(" +12 ")));
    try std.testing.expectError(error.InvalidNonNegativeInteger, nonNegative("-1"));
    try std.testing.expect(try boolean(" true "));
    try std.testing.expectError(error.InvalidXmlBoolean, boolean("TRUE"));
    try std.testing.expectEqual(@as(i16, -32768), try short(" -32768 "));
    try std.testing.expectEqual(@as(i16, 32767), try short("+32767"));
    try std.testing.expectError(error.InvalidXmlShort, short("32768"));
    try std.testing.expectError(error.InvalidXmlShort, short("1_0"));
    try std.testing.expectEqual(@as(i32, -2147483648), try signed32(" -2147483648 "));
    try std.testing.expectEqual(@as(i32, 2147483647), try signed32("+2147483647"));
    for ([_][]const u8{ "", "+", "1_0", "2147483648", "-2147483649" }) |bad| {
        try std.testing.expectError(error.InvalidXmlSigned32, signed32(bad));
    }
    try std.testing.expectEqual(@as(u32, 0), try unsigned32("-000"));
    try std.testing.expectEqual(@as(u32, 4294967295), try unsigned32("4294967295"));
    try std.testing.expectError(error.InvalidUnsigned32, unsigned32("4294967296"));
    try std.testing.expectEqual(@as(i64, -21280), try signedOrUnsigned32(" -21280 "));
    try std.testing.expectEqual(@as(i64, 4294948081), try signedOrUnsigned32("4294948081"));
    try std.testing.expectEqual(@as(i64, -2147483648), try signedOrUnsigned32("-2147483648"));
    try std.testing.expectEqual(@as(i64, 4294967295), try signedOrUnsigned32("+4294967295"));
    try std.testing.expectEqual(@as(i64, 0), try signedOrUnsigned32("-000"));
    const bad_values = [_][]const u8{ "", "+", "1_0", "-2147483649", "4294967296" };
    for (bad_values) |bad| {
        try std.testing.expectError(error.InvalidSignedOrUnsigned32, signedOrUnsigned32(bad));
    }
    for ([_][]const u8{ "0", "-1.5", ".25", "2.", "+1e-12", "INF", "-INF", "NaN" }) |good| try floatLexical(good);
    for ([_][]const u8{ "", "+", ".", "1e", "1_0", "infinity", "+INF" }) |bad| try std.testing.expectError(error.InvalidXmlFloat, floatLexical(bad));
}
