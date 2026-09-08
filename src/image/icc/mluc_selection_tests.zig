const std = @import("std");
const t = std.testing;
const mluc = @import("mluc.zig");
const selection = @import("mluc_selection.zig");
fn fixture() [68]u8 {
    var b: [68]u8 = @splat(0);
    @memcpy(b[0..4], "mluc");
    std.mem.writeInt(u32, b[8..12], 4, .big);
    std.mem.writeInt(u32, b[12..16], 12, .big);
    for ([_]*const [4]u8{ "enGB", "koKR", "enUS", "enUS" }, 0..) |locale, i| {
        const o = 16 + i * 12;
        @memcpy(b[o..][0..4], locale);
        std.mem.writeInt(u32, b[o + 4 ..][0..4], 4, .big);
        std.mem.writeInt(u32, b[o + 8 ..][0..4], 64, .big);
    }
    // Intentionally malformed Unicode: selecting a record is not validation.
    @memcpy(b[64..], &[_]u8{ 0xdc, 0, 0, 0 });
    return b;
}
test "IANA selection is opt in and preserves policy ties and deferred validation" {
    var b = fixture();
    for ([_]*const [4]u8{ "frFR", "iwUS", "heBU", "heMM" }, 0..) |locale, i|
        @memcpy(b[16 + i * 12 ..][0..4], locale);
    const view = try mluc.parse(&b, .{});
    const prefs = &[_]selection.Preference{.{ .language = "HE".*, .country = "MM".* }};
    const raw = (try selection.select(view, prefs, .{})).?;
    try t.expectEqual(selection.Reason.first_record, raw.reason);
    const mapped = (try selection.select(view, prefs, .{ .matching = .iana_direct })).?;
    try t.expectEqual(@as(usize, 2), mapped.index);
    try t.expectEqual(selection.Reason.exact, mapped.reason);
    try t.expect(mapped.locale_deferred and mapped.unicode_deferred);
    const language = (try selection.select(view, &.{.{ .language = "he".* }}, .{ .matching = .iana_direct })).?;
    try t.expectEqual(@as(usize, 1), language.index);
    try t.expectEqual(selection.Reason.language, language.reason);
    try t.expectError(error.LimitExceeded, selection.select(view, prefs, .{ .matching = .iana_direct, .max_records = 3 }));
    try t.expectError(error.LimitExceeded, selection.select(view, prefs, .{ .matching = .iana_direct, .max_preferences = 0 }));
}
test "IANA selection does not invent ambiguous language or country aliases" {
    for ([_][2]*const [4]u8{ .{ "shRS", "srRS" }, .{ "bhIN", "biIN" }, .{ "zzUS", "ZZUS" } }) |pair| {
        var b = fixture();
        @memcpy(b[16..20], pair[0]);
        const view = try mluc.parse(&b, .{});
        const s = (try selection.select(view, &.{.{ .language = pair[1][0..2].*, .country = pair[1][2..4].* }}, .{ .matching = .iana_direct })).?;
        try t.expectEqual(selection.Reason.first_record, s.reason);
    }
    for ([_][2]*const [2]u8{ .{ "UK", "GB" }, .{ "AN", "CW" } }) |pair| {
        var b = fixture();
        @memcpy(b[18..20], pair[0]);
        const s = (try selection.select(try mluc.parse(&b, .{}), &.{.{ .language = "en".*, .country = pair[1].* }}, .{ .matching = .iana_direct })).?;
        try t.expectEqual(selection.Reason.language, s.reason);
        try t.expectEqual(@as(usize, 0), s.index);
    }
}
test "mluc selection prefers late exact match and retains wire order on ties" {
    const b = fixture();
    const view = try mluc.parse(&b, .{});
    const exact = (try selection.select(view, &.{.{ .language = "en".*, .country = "US".* }}, .{})).?;
    try t.expectEqual(@as(usize, 2), exact.index);
    try t.expectEqual(selection.Reason.exact, exact.reason);
    try t.expect(exact.locale_deferred and exact.unicode_deferred);
    const language = (try selection.select(view, &.{.{ .language = "en".*, .country = "AU".* }}, .{})).?;
    try t.expectEqual(@as(usize, 0), language.index);
    try t.expectEqual(selection.Reason.language, language.reason);
    const unspecified = (try selection.select(view, &.{.{ .language = "en".* }}, .{})).?;
    try t.expectEqual(language, unspecified);
}
test "mluc selection exhausts ordered preferences before first record fallback" {
    const b = fixture();
    const view = try mluc.parse(&b, .{});
    const preferences: [2]selection.Preference = .{ .{ .language = "fr".*, .country = "FR".* }, .{ .language = "ko".*, .country = "KR".* } };
    const found = (try selection.select(view, &preferences, .{})).?;
    try t.expectEqual(@as(usize, 1), found.index);
    try t.expectEqual(@as(?usize, 1), found.preference_index);
    const first = (try selection.select(view, preferences[0..1], .{})).?;
    try t.expectEqual(selection.Reason.first_record, first.reason);
    try t.expectEqual(@as(?usize, null), first.preference_index);
    try t.expectEqual(first, (try selection.select(view, &.{}, .{})).?);
    const priority = (try selection.select(view, &.{ .{ .language = "en".*, .country = "AU".* }, preferences[1] }, .{})).?;
    try t.expectEqual(@as(usize, 0), priority.index);
    try t.expectEqual(@as(?usize, 0), priority.preference_index);
    try t.expectError(error.LimitExceeded, selection.select(view, &preferences, .{ .max_preferences = 1 }));
    try t.expectError(error.LimitExceeded, selection.select(view, &.{}, .{ .max_records = 3 }));
    var empty = b;
    std.mem.writeInt(u32, empty[8..12], 0, .big);
    const empty_view = try mluc.parse(empty[0..16], .{});
    try t.expectEqual(@as(?selection.Selection, null), try selection.select(empty_view, &.{}, .{ .max_records = 0, .max_preferences = 0 }));
    try t.expectError(error.LimitExceeded, selection.select(empty_view, &preferences, .{ .max_preferences = 0 }));
}
