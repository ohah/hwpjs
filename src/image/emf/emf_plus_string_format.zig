const std = @import("std");
const binary = @import("../../binary/reader.zig");
const data = @import("emf_plus_string_format_data.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const object = @import("emf_plus_object.zig");
const string_values = @import("emf_plus_string_values.zig");
const values = @import("emf_plus_values.zig");

pub const Options = struct {
    max_string_format_bytes: usize = 64 * 1024 * 1024,
    data_options: data.Options = .{},
};

pub const StringFormat = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    flags: string_values.FormatFlags,
    language: string_values.LanguageIdentifier,
    string_alignment: string_values.Alignment,
    line_alignment: string_values.Alignment,
    digit_substitution: string_values.DigitSubstitution,
    digit_language: string_values.LanguageIdentifier,
    first_tab_offset: f32,
    hotkey_prefix: string_values.HotkeyPrefix,
    leading_margin: f32,
    trailing_margin: f32,
    tracking: f32,
    trimming: string_values.Trimming,
    tab_stop_count: i32,
    range_count: i32,
    format_data: data.Data,
};

pub fn parse(bytes: []const u8, options: Options) !StringFormat {
    if (bytes.len > options.max_string_format_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const version = try graphics_version.parse(try reader.readInt(u32));
    const flags = try string_values.FormatFlags.parse(try reader.readInt(u32));
    const language: string_values.LanguageIdentifier = .{ .raw = try reader.readInt(u32) };
    const string_alignment = try string_values.Alignment.parse(try reader.readInt(u32));
    const line_alignment = try string_values.Alignment.parse(try reader.readInt(u32));
    const digit_substitution = try string_values.DigitSubstitution.parse(try reader.readInt(u32));
    const digit_language: string_values.LanguageIdentifier = .{ .raw = try reader.readInt(u32) };
    const first_tab_offset = try values.readFloat(&reader);
    const hotkey_prefix = try string_values.HotkeyPrefix.parse(try reader.readInt(i32));
    const leading_margin = try values.readFloat(&reader);
    const trailing_margin = try values.readFloat(&reader);
    const tracking = try values.readFloat(&reader);
    const trimming = try string_values.Trimming.parse(try reader.readInt(u32));
    const tab_stop_count = try reader.readInt(i32);
    const range_count = try reader.readInt(i32);
    const format_data = try data.parse(bytes[reader.offset..], tab_stop_count, range_count, options.data_options);
    return .{
        .bytes = bytes,
        .version = version,
        .flags = flags,
        .language = language,
        .string_alignment = string_alignment,
        .line_alignment = line_alignment,
        .digit_substitution = digit_substitution,
        .digit_language = digit_language,
        .first_tab_offset = first_tab_offset,
        .hotkey_prefix = hotkey_prefix,
        .leading_margin = leading_margin,
        .trailing_margin = trailing_margin,
        .tracking = tracking,
        .trimming = trimming,
        .tab_stop_count = tab_stop_count,
        .range_count = range_count,
        .format_data = format_data,
    };
}

pub fn parseCompleted(value: object.Completed, options: Options) !StringFormat {
    if (value.object_type != .string_format) return error.NotEmfPlusStringFormatObject;
    return parse(value.object_data, options);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

fn putI32(bytes: []u8, offset: usize, value: i32) void {
    std.mem.writeInt(i32, bytes[offset..][0..4], value, .little);
}

fn putF32(bytes: []u8, offset: usize, value: f32) void {
    putU32(bytes, offset, @bitCast(value));
}

fn validBytes() [76]u8 {
    var bytes = [_]u8{0} ** 76;
    putU32(&bytes, 0, 0xdbc01002);
    putU32(&bytes, 4, 0x8000_0001);
    putU32(&bytes, 8, 0xdead_0411);
    putU32(&bytes, 12, 1);
    putU32(&bytes, 16, 2);
    putU32(&bytes, 20, 3);
    putU32(&bytes, 24, 0xbeef_0401);
    putF32(&bytes, 28, 4);
    putI32(&bytes, 32, 2);
    putF32(&bytes, 36, 1);
    putF32(&bytes, 40, 2);
    putF32(&bytes, 44, 1.25);
    putU32(&bytes, 48, 3);
    putI32(&bytes, 52, 2);
    putI32(&bytes, 56, 1);
    putF32(&bytes, 60, 8);
    putF32(&bytes, 64, 16);
    putI32(&bytes, 68, -1);
    putI32(&bytes, 72, 5);
    return bytes;
}

test "EMF+ StringFormat parses the fixed header and exact trailing arrays" {
    const bytes = validBytes();
    const value = try parse(&bytes, .{});
    try std.testing.expectEqual(@as(u12, 2), value.version.version);
    try std.testing.expect(value.flags.direction_right_to_left);
    try std.testing.expect(value.flags.bypass_gdi);
    try std.testing.expectEqual(@as(u32, 0xdead_0411), value.language.raw);
    try std.testing.expectEqual(@as(u10, 0x11), value.language.primaryLanguageId());
    try std.testing.expectEqual(string_values.Alignment.center, value.string_alignment);
    try std.testing.expectEqual(string_values.Alignment.far, value.line_alignment);
    try std.testing.expectEqual(string_values.DigitSubstitution.traditional, value.digit_substitution);
    try std.testing.expectEqual(@as(u32, 0xbeef_0401), value.digit_language.raw);
    try std.testing.expectEqual(@as(f32, 4), value.first_tab_offset);
    try std.testing.expectEqual(string_values.HotkeyPrefix.hide, value.hotkey_prefix);
    try std.testing.expectEqual(@as(f32, 1), value.leading_margin);
    try std.testing.expectEqual(@as(f32, 2), value.trailing_margin);
    try std.testing.expectEqual(@as(f32, 1.25), value.tracking);
    try std.testing.expectEqual(string_values.Trimming.ellipsis_character, value.trimming);
    try std.testing.expectEqual(@as(f32, 16), try value.format_data.tab_stops.at(1));
    const range = try value.format_data.character_ranges.at(0);
    try std.testing.expectEqual(@as(i32, -1), range.first);
    try std.testing.expectEqual(@as(i32, 5), range.length);
}

test "EMF+ StringFormat accepts the exact fixed header with empty optional arrays" {
    var bytes = validBytes();
    putI32(&bytes, 52, 0);
    putI32(&bytes, 56, 0);
    const value = try parse(bytes[0..60], .{ .max_string_format_bytes = 60, .data_options = .{ .max_tab_stops = 0, .max_character_ranges = 0 } });
    try std.testing.expectEqual(@as(u32, 0), value.format_data.tab_stops.count);
    try std.testing.expectEqual(@as(u32, 0), value.format_data.character_ranges.count);
    try std.testing.expectEqual(@as(usize, 0), value.format_data.bytes.len);
}

test "EMF+ StringFormat character range view uses an eight-byte stride" {
    const base = validBytes();
    var bytes = [_]u8{0} ** 84;
    @memcpy(bytes[0..76], &base);
    putI32(&bytes, 56, 2);
    putI32(&bytes, 76, 17);
    putI32(&bytes, 80, 23);
    const value = try parse(&bytes, .{});
    const second = try value.format_data.character_ranges.at(1);
    try std.testing.expectEqual(@as(i32, 17), second.first);
    try std.testing.expectEqual(@as(i32, 23), second.length);
}

test "EMF+ StringFormat rejects every truncation limits trailing bytes and wrong object type" {
    const bytes = validBytes();
    for (0..bytes.len) |cut| {
        if (parse(bytes[0..cut], .{})) |_| return error.TestExpectedError else |_| {}
    }
    _ = try parse(&bytes, .{ .max_string_format_bytes = bytes.len, .data_options = .{ .max_tab_stops = 2, .max_character_ranges = 1 } });
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_string_format_bytes = bytes.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .data_options = .{ .max_tab_stops = 1 } }));
    var trailing: [77]u8 = undefined;
    @memcpy(trailing[0..76], &bytes);
    trailing[76] = 0;
    try std.testing.expectError(error.InvalidEmfPlusStringFormatTrailingData, parse(&trailing, .{}));
    try std.testing.expectError(error.NotEmfPlusStringFormatObject, parseCompleted(.{ .object_id = 0, .object_type = .font, .object_data = &bytes, .multipart = false }, .{}));
    _ = try parseCompleted(.{ .object_id = 0, .object_type = .string_format, .object_data = &bytes, .multipart = false }, .{});
}

test "EMF+ StringFormat rejects each enum flags and signed count violation" {
    const cases = [_]struct { offset: usize, raw: u32 }{
        .{ .offset = 4, .raw = 8 },
        .{ .offset = 12, .raw = 3 },
        .{ .offset = 16, .raw = 3 },
        .{ .offset = 20, .raw = 4 },
        .{ .offset = 32, .raw = 3 },
        .{ .offset = 48, .raw = 6 },
        .{ .offset = 52, .raw = 0xffff_ffff },
        .{ .offset = 56, .raw = 0xffff_ffff },
    };
    for (cases) |case| {
        var bytes = validBytes();
        putU32(&bytes, case.offset, case.raw);
        if (parse(&bytes, .{})) |_| return error.TestExpectedError else |_| {}
    }
}
