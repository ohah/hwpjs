pub const FontStyleFlags = packed struct(u32) {
    bold: bool,
    italic: bool,
    underline: bool,
    strikeout: bool,
    reserved: u28,

    pub fn parse(raw_value: i32) !FontStyleFlags {
        const value: FontStyleFlags = @bitCast(raw_value);
        if (value.reserved != 0) return error.InvalidEmfPlusFontStyleFlags;
        return value;
    }

    pub fn raw(self: FontStyleFlags) i32 {
        return @bitCast(self);
    }
};

test "EMF+ FontStyle accepts all four flags and rejects every other bit" {
    const std = @import("std");
    const all = try FontStyleFlags.parse(0x0f);
    try std.testing.expect(all.bold and all.italic and all.underline and all.strikeout);
    try std.testing.expectEqual(@as(i32, 0x0f), all.raw());
    inline for (.{ 0x10, 0x100, 0x4000_0000, -0x8000_0000 }) |raw_value|
        try std.testing.expectError(error.InvalidEmfPlusFontStyleFlags, FontStyleFlags.parse(raw_value));
}
