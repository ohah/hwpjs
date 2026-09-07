const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const calendar = @import("date_calendar.zig");
pub const Layout = enum { preserve_raw, observed_systemtime16 };
pub const Fields = struct {
    year: u16,
    month: u16,
    weekday: u16,
    day: u16,
    hour: u16,
    minute: u16,
    second: u16,
    milliseconds: u16,
};
pub const Diagnostics = struct {
    /// Bit order matches Fields / the eight observed WORDs.
    invalid_fields: u8,
    /// Null when year/month/day member ranges do not permit a calendar check.
    calendar_valid: ?bool,
    /// Null for invalid calendar dates or out-of-range weekday members.
    weekday_matches: ?bool,
};
pub const View = struct {
    fields: Fields,
    extra: []const u8,
    /// Explicit observed SYSTEMTIME-shaped prefix, never a timezone conversion.
    pub fn parseObserved(bytes: []const u8) !View {
        var r: Reader = .{ .bytes = bytes };
        var fields: Fields = undefined;
        inline for (std.meta.fields(Fields)) |f| @field(fields, f.name) = try r.readInt(u16);
        return .{ .fields = fields, .extra = bytes[r.offset..] };
    }
    pub fn diagnostics(self: View) Diagnostics {
        const f = self.fields;
        const invalid = [_]bool{
            f.year < 1601 or f.year > 30827, f.month < 1 or f.month > 12,
            f.weekday > 6,                   f.day < 1 or f.day > 31,
            f.hour > 23,                     f.minute > 59,
            f.second > 59,                   f.milliseconds > 999,
        };
        var mask: u8 = 0;
        for (invalid, 0..) |bad, i| if (bad) {
            mask |= @as(u8, 1) << @intCast(i);
        };
        const calendar_valid: ?bool = if (invalid[0] or invalid[1] or invalid[3]) null else f.day <= calendar.daysInMonth(f.year, f.month).?;
        const matches: ?bool = if (calendar_valid == true and !invalid[2]) f.weekday == calendar.weekday(f.year, f.month, f.day).? else null;
        return .{ .invalid_fields = mask, .calendar_valid = calendar_valid, .weekday_matches = matches };
    }
};
