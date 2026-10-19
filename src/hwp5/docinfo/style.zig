const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
pub const CharacterPolicy = enum { required, observed_absent };
pub const Style = struct {
    local_utf16: []const u8,
    english_utf16: []const u8,
    attributes: u8,
    next_style_id: u8,
    language_id: i16,
    para_shape_id: u16,
    char_shape_id: u16,
    char_shape_present: bool = true,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Style {
        return parseWithCharacterPolicy(bytes, .required);
    }

    pub fn parseWithCharacterPolicy(bytes: []const u8, policy: CharacterPolicy) !Style {
        var r: Reader = .{ .bytes = bytes };
        var value: Style = undefined;
        value.local_utf16 = try string.read(&r);
        value.english_utf16 = try string.read(&r);
        value.attributes = try r.readInt(u8);
        value.next_style_id = try r.readInt(u8);
        value.language_id = try r.readInt(i16);
        value.para_shape_id = try r.readInt(u16);
        value.char_shape_present = !(policy == .observed_absent and r.offset == bytes.len);
        value.char_shape_id = if (value.char_shape_present) try r.readInt(u16) else 0;
        value.extra = bytes[r.offset..];
        return value;
    }
};

test "observed absent style character reference is not a recorded zero or shifted language" {
    const std = @import("std");
    var bytes = @as([14]u8, @splat(0));
    std.mem.writeInt(i16, bytes[6..8], 1042, .little);
    std.mem.writeInt(u16, bytes[8..10], 18, .little);
    const absent = try Style.parseWithCharacterPolicy(bytes[0..10], .observed_absent);
    try std.testing.expect(!absent.char_shape_present);
    try std.testing.expectEqual(@as(i16, 1042), absent.language_id);
    try std.testing.expectEqual(@as(u16, 18), absent.para_shape_id);
    try std.testing.expectEqual(@as(usize, 0), absent.extra.len);
    for (0..10) |length| try std.testing.expectError(error.UnexpectedEnd, Style.parseWithCharacterPolicy(bytes[0..length], .observed_absent));
    try std.testing.expectError(error.UnexpectedEnd, Style.parse(bytes[0..10]));
    try std.testing.expectError(error.UnexpectedEnd, Style.parseWithCharacterPolicy(bytes[0..11], .observed_absent));
    const zero = try Style.parseWithCharacterPolicy(bytes[0..12], .observed_absent);
    try std.testing.expect(zero.char_shape_present);
    try std.testing.expectEqual(@as(u16, 0), zero.char_shape_id);
    std.mem.writeInt(u16, bytes[10..12], 17, .little);
    const full = try Style.parseWithCharacterPolicy(&bytes, .observed_absent);
    try std.testing.expectEqual(@as(u16, 17), full.char_shape_id);
    try std.testing.expectEqual(@as(usize, 2), full.extra.len);
}
