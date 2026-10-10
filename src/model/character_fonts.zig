//! Language-scoped font intent. Null means no requested change, never font zero.
const std = @import("std");
pub const Language = enum(u8) { hangul, latin, hanja, japanese, other, symbol, user };
pub const languages = std.enums.values(Language);
pub const Values = [languages.len]?u32;

pub fn merge(previous: Values, requested: Values) Values {
    var result = previous;
    for (requested, 0..) |id, index| if (id) |value| {
        result[index] = value;
    };
    return result;
}
pub fn matches(current: Values, requested: Values) bool {
    for (current, requested) |before, after| if (after != null and before != after) return false;
    return true;
}
pub fn validateHwp5(requested: Values) !void {
    for (requested) |id| if (id) |value| if (value > std.math.maxInt(u16)) return error.InvalidFontId;
}
pub fn fromHwp5(ids: [languages.len]u16) Values {
    var result: Values = @splat(null);
    for (ids, 0..) |id, index| result[index] = id;
    return result;
}

test "character font intent preserves prior languages and explicit zero" {
    const empty: Values = @splat(null);
    const hangul = merge(empty, .{ 7, null, null, null, null, null, null });
    const both = merge(hangul, .{ null, 0, null, null, null, null, null });
    try std.testing.expectEqualDeep(Values{ 7, 0, null, null, null, null, null }, both);
    try std.testing.expectEqualDeep(both, merge(both, empty));
    try std.testing.expect(matches(both, hangul));
    try std.testing.expect(!matches(empty, .{ 0, null, null, null, null, null, null }));
    try std.testing.expect(matches(both, empty));
    try validateHwp5(.{ 0, 65535, null, null, null, null, null });
    for (0..languages.len) |index| {
        var too_large: Values = empty;
        too_large[index] = 65536;
        try std.testing.expectError(error.InvalidFontId, validateHwp5(too_large));
    }
}
