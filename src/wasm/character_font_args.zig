const fonts = @import("../model/character_fonts.zig");
pub fn decode(language: u32, id: u32) !fonts.Values {
    if (language >= fonts.languages.len) return error.InvalidCharacterFontLanguage;
    var values: fonts.Values = @splat(null);
    values[language] = id;
    return values;
}

test "font ABI arguments retain zero max ID and reject invalid language indices" {
    const std = @import("std");
    for (0..fonts.languages.len) |language| {
        for ([_]u32{ 0, std.math.maxInt(u16), std.math.maxInt(u32) }) |id| {
            const values = try decode(@intCast(language), id);
            for (values, 0..) |value, index| {
                try std.testing.expectEqual(if (index == language) @as(?u32, id) else null, value);
            }
        }
    }
    for ([_]u32{ 7, 8, 255, std.math.maxInt(u32) }) |language| try std.testing.expectError(error.InvalidCharacterFontLanguage, decode(language, 0));
}
