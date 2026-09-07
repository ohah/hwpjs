/// Proleptic Gregorian calendar only; no timezone or host clock access.
pub fn daysInMonth(year: u16, month: u16) ?u8 {
    return switch (month) {
        1, 3, 5, 7, 8, 10, 12 => 31,
        4, 6, 9, 11 => 30,
        2 => if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) 29 else 28,
        else => null,
    };
}
pub fn weekday(year: u16, month: u16, day: u16) ?u8 {
    if (year == 0) return null;
    const days = daysInMonth(year, month) orelse return null;
    if (day == 0 or day > days) return null;
    const previous: u32 = @as(u32, year) - 1;
    var ordinal = previous * 365 + previous / 4 - previous / 100 + previous / 400 + day;
    var m: u16 = 1;
    while (m < month) : (m += 1) ordinal += daysInMonth(year, m).?;
    // Gregorian 0001-01-01 is Monday; Sunday is zero in SYSTEMTIME.
    return @intCast(ordinal % 7);
}
