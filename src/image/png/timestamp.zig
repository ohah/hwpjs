const std = @import("std");
/// PNG field ranges only; no calendar normalization or host timezone conversion.
pub const Value = struct { year: u16, month: u8, day: u8, hour: u8, minute: u8, second: u8 };
pub fn parse(bytes: []const u8) !Value {
    if (bytes.len != 7) return error.InvalidPngTimestampSize;
    if (bytes[2] < 1 or bytes[2] > 12 or bytes[3] < 1 or bytes[3] > 31 or bytes[4] > 23 or bytes[5] > 59 or bytes[6] > 60) return error.InvalidPngTimestampValue;
    return .{ .year = std.mem.readInt(u16, bytes[0..2], .big), .month = bytes[2], .day = bytes[3], .hour = bytes[4], .minute = bytes[5], .second = bytes[6] };
}
