/// Real-power domain and parity for a signed 16.16 encoded exponent.
pub const Class = enum { fractional, even_integer, odd_integer };
pub fn classify(raw: i32) Class {
    if (@rem(raw, 65536) != 0) return .fractional;
    return if (@rem(@divTrunc(raw, 65536), 2) == 0) .even_integer else .odd_integer;
}
