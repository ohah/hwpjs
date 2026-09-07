const std = @import("std");
const mluc = @import("mluc.zig");
pub const Preference = struct { language: [2]u8, country: ?[2]u8 = null };
pub const Reason = enum { exact, language, first_record };
pub const Selection = struct {
    index: usize,
    preference_index: ?usize,
    reason: Reason,
    /// Selection does not certify ISO registration, aliases or Unicode content.
    locale_deferred: bool = true,
    unicode_deferred: bool = true,
};
pub const Options = struct { max_records: usize = 100000, max_preferences: usize = 32 };
/// Input is an immutable parsed View. Preferences are ordered by the caller.
/// For each preference prefer exact region, then its language, before trying
/// the next preference. Ties retain wire order. Codes are compared byte-for-byte.
pub fn select(view: mluc.View, preferences: []const Preference, options: Options) !?Selection {
    if (view.count > options.max_records or preferences.len > options.max_preferences) return error.LimitExceeded;
    if (view.count == 0) return null;
    for (preferences, 0..) |p, pi| {
        var language_match: ?usize = null;
        for (0..view.count) |i| {
            const r = try view.at(i);
            if (!std.mem.eql(u8, &r.language, &p.language)) continue;
            if (p.country) |country| {
                if (std.mem.eql(u8, &r.country, &country)) return .{ .index = i, .preference_index = pi, .reason = .exact };
            } else return .{ .index = i, .preference_index = pi, .reason = .language };
            if (language_match == null) language_match = i;
        }
        if (language_match) |i| return .{ .index = i, .preference_index = pi, .reason = .language };
    }
    return .{ .index = 0, .preference_index = null, .reason = .first_record };
}
