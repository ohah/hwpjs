pub const Alignment = enum(u32) {
    near = 0,
    center = 1,
    far = 2,

    pub fn parse(raw: u32) !Alignment {
        return switch (raw) {
            0...2 => @enumFromInt(raw),
            else => error.InvalidEmfPlusStringAlignment,
        };
    }
};

pub const DigitSubstitution = enum(u32) {
    user = 0,
    none = 1,
    national = 2,
    traditional = 3,

    pub fn parse(raw: u32) !DigitSubstitution {
        return switch (raw) {
            0...3 => @enumFromInt(raw),
            else => error.InvalidEmfPlusStringDigitSubstitution,
        };
    }
};

pub const Trimming = enum(u32) {
    none = 0,
    character = 1,
    word = 2,
    ellipsis_character = 3,
    ellipsis_word = 4,
    ellipsis_path = 5,

    pub fn parse(raw: u32) !Trimming {
        return switch (raw) {
            0...5 => @enumFromInt(raw),
            else => error.InvalidEmfPlusStringTrimming,
        };
    }
};

pub const HotkeyPrefix = enum(i32) {
    none = 0,
    show = 1,
    hide = 2,

    pub fn parse(raw: i32) !HotkeyPrefix {
        return switch (raw) {
            0...2 => @enumFromInt(raw),
            else => error.InvalidEmfPlusHotkeyPrefix,
        };
    }
};

pub const LanguageIdentifier = struct {
    raw: u32,

    pub fn primaryLanguageId(self: LanguageIdentifier) u10 {
        return @truncate(self.raw);
    }

    pub fn subLanguageId(self: LanguageIdentifier) u6 {
        return @truncate(self.raw >> 10);
    }
};

pub const defined_format_flags: u32 = 0x8000_7c27;

pub const FormatFlags = packed struct(u32) {
    direction_right_to_left: bool,
    direction_vertical: bool,
    no_fit_black_box: bool,
    reserved_03_04: u2,
    display_format_control: bool,
    reserved_06_09: u4,
    no_font_fallback: bool,
    measure_trailing_spaces: bool,
    no_wrap: bool,
    line_limit: bool,
    no_clip: bool,
    reserved_15_30: u16,
    bypass_gdi: bool,

    pub fn parse(bits: u32) !FormatFlags {
        if (bits & ~defined_format_flags != 0) return error.InvalidEmfPlusStringFormatFlags;
        return @bitCast(bits);
    }

    pub fn raw(self: FormatFlags) u32 {
        return @bitCast(self);
    }
};

test "EMF+ StringFormat value domains and sparse flags are exact" {
    const std = @import("std");
    inline for (0..3) |raw| _ = try Alignment.parse(raw);
    inline for (0..4) |raw| _ = try DigitSubstitution.parse(raw);
    inline for (0..6) |raw| _ = try Trimming.parse(raw);
    inline for (0..3) |raw| _ = try HotkeyPrefix.parse(raw);
    try std.testing.expectError(error.InvalidEmfPlusStringAlignment, Alignment.parse(3));
    try std.testing.expectError(error.InvalidEmfPlusStringDigitSubstitution, DigitSubstitution.parse(4));
    try std.testing.expectError(error.InvalidEmfPlusStringTrimming, Trimming.parse(6));
    try std.testing.expectError(error.InvalidEmfPlusHotkeyPrefix, HotkeyPrefix.parse(-1));
    try std.testing.expectError(error.InvalidEmfPlusHotkeyPrefix, HotkeyPrefix.parse(3));

    const flags = try FormatFlags.parse(defined_format_flags);
    try std.testing.expectEqual(defined_format_flags, flags.raw());
    try std.testing.expect(flags.direction_right_to_left);
    try std.testing.expect(flags.bypass_gdi);
    inline for (.{ 0x0000_0008, 0x0000_0010, 0x0000_0040, 0x0000_0080, 0x0000_0100, 0x0000_0200, 0x0000_8000, 0x4000_0000 }) |raw|
        try std.testing.expectError(error.InvalidEmfPlusStringFormatFlags, FormatFlags.parse(raw));

    const language: LanguageIdentifier = .{ .raw = 0xdead_0411 };
    try std.testing.expectEqual(@as(u10, 0x11), language.primaryLanguageId());
    try std.testing.expectEqual(@as(u6, 1), language.subLanguageId());
}
