/// ICC v4 7.2.16: signed 16.16 values rounded to four decimals equal D50.
/// Do not compare against just one encoded integer or use PNG's 100000 scale.
const d50 = [_]i64{ 9642, 10000, 8249 };
pub fn validateV4(value: [3]i32) !void {
    for (value, d50) |raw, expected| {
        if (raw < 0) return error.InvalidIccIlluminant;
        const rounded = @divTrunc(@as(i64, raw) * 10000 + 32768, 65536);
        if (rounded != expected) return error.InvalidIccIlluminant;
    }
}
/// v2 states decimal D50 without v4's explicit four-decimal rounding rule.
/// Caller must choose a numeric comparison policy; neither certifies all v2 rules.
pub const V2Policy = enum { nearest_encoding, rounded_four_decimals };
pub fn validateV2(value: [3]i32, policy: V2Policy) !void {
    if (policy == .rounded_four_decimals) return validateV4(value);
    for (value, d50) |raw, target| {
        const nearest = @divTrunc(target * 65536 + 5000, 10000);
        if (raw != nearest) return error.InvalidIccIlluminant;
    }
}
