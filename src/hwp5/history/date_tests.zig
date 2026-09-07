const std = @import("std");
const t = std.testing;
const date = @import("date.zig");
const item = @import("item.zig");
const calendar = @import("date_calendar.zig");
test "observed history date preserves all eight fields, odd trailing bytes and invalid values" {
    const bytes = [_]u8{ 0xd4, 7, 9, 0, 4, 0, 16, 0, 14, 0, 25, 0, 45, 0, 0xdd, 2, 9 };
    for (0..16) |n| try t.expectError(error.UnexpectedEnd, date.View.parseObserved(bytes[0..n]));
    const v = try date.View.parseObserved(&bytes);
    try t.expectEqualSlices(u8, &.{9}, v.extra);
    try t.expectEqual(@as(u16, 2004), v.fields.year);
    try t.expectEqual(@as(u16, 733), v.fields.milliseconds);
    try t.expectEqual(date.Diagnostics{ .invalid_fields = 0, .calendar_valid = true, .weekday_matches = true }, v.diagnostics());
    const all_bad = try date.View.parseObserved(&(@as([16]u8, @splat(255))));
    try t.expectEqual(date.Diagnostics{ .invalid_fields = 255, .calendar_valid = null, .weekday_matches = null }, all_bad.diagnostics());
    var f = v;
    f.fields.month = 2;
    f.fields.day = 30;
    try t.expectEqual(date.Diagnostics{ .invalid_fields = 0, .calendar_valid = false, .weekday_matches = null }, f.diagnostics());
    f = v;
    f.fields.weekday = 5;
    try t.expectEqual(@as(?bool, false), f.diagnostics().weekday_matches);
}
test "Gregorian leap centuries and zero boundaries do not use a timezone" {
    try t.expectEqual(@as(?u8, 28), calendar.daysInMonth(1900, 2));
    try t.expectEqual(@as(?u8, 29), calendar.daysInMonth(2000, 2));
    try t.expectEqual(@as(?u8, 28), calendar.daysInMonth(2100, 2));
    try t.expectEqual(@as(?u8, 2), calendar.weekday(2000, 2, 29));
    try t.expectEqual(@as(?u8, 1), calendar.weekday(1601, 1, 1));
    try t.expectEqual(@as(?u8, null), calendar.weekday(0, 1, 1));
    try t.expectEqual(@as(?u8, null), calendar.weekday(2000, 0, 1));
    try t.expectEqual(@as(?u8, null), calendar.weekday(2000, 13, 1));
    try t.expectEqual(@as(?u8, null), calendar.weekday(2000, 1, 0));
    try t.expectEqual(@as(?u8, null), calendar.weekday(1900, 2, 29));
}
test "history date layout selection preserves default acceptance and reports duplicate dates" {
    const prefix = [_]u8{ 0x10, 6, 0, 0, 0, 2, 0, 0, 0, 0, 0 };
    const end = [_]u8{ 0x11, 0, 0, 0, 0 };
    const short = prefix ++ [_]u8{ 0x21, 0, 0, 0, 0 } ++ end;
    try t.expectEqual(@as(usize, 1), (try item.Item.parse(&short, .{ .start_layout = .spec_flag_first })).report.date_records_deferred);
    try t.expectError(error.UnexpectedEnd, item.Item.parse(&short, .{ .start_layout = .spec_flag_first, .date_layout = .observed_systemtime16 }));
    const invalid = [_]u8{ 0x21, 16, 0, 0, 0 } ++ ([_]u8{255} ** 16);
    const raw = prefix ++ invalid ++ invalid ++ end;
    const parsed = try item.Item.parse(&raw, .{ .start_layout = .spec_flag_first, .date_layout = .observed_systemtime16 });
    try t.expectEqual(@as(usize, 0), parsed.report.date_records_deferred);
    try t.expectEqual(@as(usize, 2), parsed.report.date_records_inspected);
    try t.expectEqual(@as(usize, 2), parsed.report.date_invalid_fields);
    try t.expectEqual(@as(usize, 1), parsed.report.duplicate_presence_records);
    try t.expectEqualSlices(u8, &raw, parsed.raw);
}
