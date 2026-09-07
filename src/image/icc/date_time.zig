/// ICC dateTimeNumber component ranges only (v2 Table 1 / v4 Table 1).
/// No timezone conversion, leap-second table or Gregorian normalization.
pub fn validateComponents(value: [6]u16) !void {
    if (value[1] < 1 or value[1] > 12 or value[2] < 1 or value[2] > 31 or
        value[3] > 23 or value[4] > 59 or value[5] > 59) return error.InvalidIccDateTime;
}
