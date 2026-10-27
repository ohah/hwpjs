//! Requested character properties only; preserve unrelated fields and tails.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub const Patch = @import("../../model/document.zig").CharacterPropertyPatch;

test "HWP5 outline payload changes only bits eight to ten across every source kind" {
    const a = std.testing.allocator;
    for (0..8) |raw| for ([_]@import("../../model/character_outline_kind.zig").Kind{ .none, .solid, .dot, .thick, .dash, .dash_dot, .dash_dot_dot }, 0..) |kind, expected_kind| {
        var input: [79]u8 = @splat(0xa5);
        const prior: u32 = (0xa5a5a5a5 & ~@as(u32, 7 << 8)) | (@as(u32, @intCast(raw)) << 8);
        std.mem.writeInt(u32, input[46..50], prior, .little);
        const output = try write(a, &input, .{ .raw = 0x05000300 }, .{ .outline_kind = kind }, 79);
        defer a.free(output);
        var expected = input;
        std.mem.writeInt(u32, expected[46..50], (prior & ~@as(u32, 7 << 8)) | (@as(u32, @intCast(expected_kind)) << 8), .little);
        try std.testing.expectEqualSlices(u8, &expected, output);
    };
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const source: [79]u8 = @splat(0xa5);
            const output = try write(allocator, &source, .{ .raw = 0x05000300 }, .{ .outline_kind = .dash_dot_dot }, 79);
            defer allocator.free(output);
            var expected = source;
            const prior = std.mem.readInt(u32, source[46..50], .little);
            std.mem.writeInt(u32, expected[46..50], (prior & ~@as(u32, 7 << 8)) | (6 << 8), .little);
            try std.testing.expectEqualSlices(u8, &expected, output);
        }
    }.run, .{});
}

test "HWP5 effect payload changes only requested bit and preserves unknown neighboring fields" {
    const a = std.testing.allocator;
    const input: [79]u8 = @splat(0xa5);
    inline for (.{ "emboss", "engrave", "superscript", "subscript" }, 13..) |name, bit| {
        for ([_]bool{ false, true }) |enabled| {
            var patch: Patch = .{};
            @field(patch, name) = enabled;
            const output = try write(a, &input, .{ .raw = 0x05000300 }, patch, 79);
            defer a.free(output);
            var expected = input;
            const prior = std.mem.readInt(u32, input[46..50], .little);
            std.mem.writeInt(u32, expected[46..50], (prior & ~(@as(u32, 1) << bit)) | (@as(u32, @intFromBool(enabled)) << bit), .little);
            try std.testing.expectEqualSlices(u8, &expected, output);
        }
    }
}

test "HWP5 shade payload preserves all other bytes versions and allocation failures" {
    const a = std.testing.allocator;
    const source: [79]u8 = @splat(0xa5);
    for ([_]u32{ 0x05000000, 0x05000201, 0x05000300, 0x05010000 }) |version| {
        for ([_]@import("../../model/shade_color.zig").Intent{ .none, .{ .color = 0xffffff }, .{ .color = 0x123456 } }) |intent| {
            const output = try write(a, &source, .{ .raw = version }, .{ .shade = intent }, 79);
            defer a.free(output);
            var expected = source;
            std.mem.writeInt(u32, expected[60..64], try @import("../../model/shade_color.zig").encodeHwp5(intent), .little);
            try std.testing.expectEqualSlices(u8, &expected, output);
        }
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            const output = try write(allocator, input, .{ .raw = 0x05000300 }, .{ .shade = .none }, 79);
            defer allocator.free(output);
            try std.testing.expectEqualSlices(u8, input[64..], output[64..]);
        }
    }.run, .{&source});
    try std.testing.expectError(error.UnexpectedEnd, write(a, source[0..63], .{ .raw = 0x05000000 }, .{ .shade = .none }, 79));
    try std.testing.expectError(error.LimitExceeded, write(a, &source, .{ .raw = 0x05000000 }, .{ .shade = .none }, 1));
    try std.testing.expectError(error.InvalidCharacterColor, write(a, &source, .{ .raw = 0x05000000 }, .{ .shade = .{ .color = 0x1000000 } }, 79));
}

pub fn validate(patch: Patch) !void {
    try @import("../../model/character_properties.zig").validate(patch);
    if (patch.underline_style == .REV3D or patch.strike_style == .REV3D) return error.UnsupportedCharacterLineStyle;
    if (patch.underline_kind == .center) return error.UnsupportedCharacterUnderlineKind;
    if (patch.font_ids) |ids| try @import("../../model/character_fonts.zig").validateHwp5(ids);
}
pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, patch: Patch, limit: usize) ![]u8 {
    if (input.len > limit) return error.LimitExceeded;
    try validate(patch);
    const shape = try @import("../docinfo/char_shape.zig").CharShape.parse(input, version);
    const legacy_strike = @import("character_decoration_compat.zig").legacyStrike(shape.underlineKindRaw(), shape.strikeKindRaw());
    const strike_color_offset: ?usize = if (patch.strike_color != null) try @import("character_strike_color_payload.zig").colorOffset(shape) else null;
    if (legacy_strike and patch.strike_color != null and patch.underline_color != null and patch.strike_color.? != patch.underline_color.?)
        return error.ConflictingCharacterDecorationColors;
    // Do not silently remove a legacy strike when adding an independent underline.
    const changes_underline_color = if (patch.underline_color) |color| @import("../../model/rgb_color.zig").hwp5(color) != shape.underline_color else false;
    if (legacy_strike and patch.strike_enabled != false and (changes_underline_color or (patch.underline_kind != null and patch.underline_kind.? != .none)))
        return error.UnsupportedLegacyCharacterDecorations;
    if (patch.strike_enabled) |enabled| _ = try @import("character_strike_payload.zig").attributes(shape.attributes, enabled);
    const lines = @import("../../model/character_line_style.zig");
    if (patch.strike_style != null and shape.strikeKindRaw() > 1) return error.UnsupportedCharacterStrikeKind;
    if (legacy_strike and patch.underline_style != null and patch.strike_enabled != false and lines.hwp5(patch.underline_style.?) != shape.underlineStyleRaw()) return error.UnsupportedLegacyCharacterDecorations;
    if (legacy_strike and patch.underline_style != null and patch.strike_style != null and patch.underline_style.? != patch.strike_style.?) return error.ConflictingCharacterDecorationStyles;
    const output = if (patch.shadow) |value| try @import("character_shadow_payload.zig").write(a, input, version, value, limit) else try a.dupe(u8, input);
    if (patch.font_ids) |ids| for (ids, 0..) |id, language| {
        if (id) |value| std.mem.writeInt(u16, output[language * 2 ..][0..2], @intCast(value), .little);
    };
    if (patch.size) |size| std.mem.writeInt(i32, output[42..46], size, .little);
    inline for (.{ .{ "ratio", 14 }, .{ "char_spacing", 21 }, .{ "relative_size", 28 }, .{ "offset", 35 } }) |entry| {
        if (@field(patch, entry[0])) |values| for (values, 0..) |value, language| if (value) |v| {
            output[entry[1] + language] = if (comptime entry[1] == 21 or entry[1] == 35) @bitCast(@as(i8, @intCast(v))) else @intCast(v);
        };
    }
    var attributes = std.mem.readInt(u32, output[46..50], .little);
    if (patch.outline_kind) |kind| attributes = (attributes & ~@as(u32, 7 << 8)) | (@as(u32, @import("character_outline_kind.zig").raw(kind)) << 8);
    inline for (.{ "emboss", "engrave", "superscript", "subscript" }, 13..) |name, bit| {
        if (@field(patch, name)) |enabled| attributes = (attributes & ~(@as(u32, 1) << bit)) | (@as(u32, @intFromBool(enabled)) << bit);
    }
    if (patch.italic) |enabled| attributes = (attributes & ~@as(u32, 1)) | @as(u32, @intFromBool(enabled));
    if (patch.bold) |enabled| attributes = (attributes & ~@as(u32, 2)) | (@as(u32, @intFromBool(enabled)) << 1);
    if (patch.strike_enabled) |enabled| attributes = try @import("character_strike_payload.zig").attributes(attributes, enabled);
    if (patch.underline_kind) |kind| if (!(legacy_strike and kind == .none and patch.strike_enabled != false)) {
        const underline = @import("character_underline_payload.zig");
        const mapped: underline.Kind = switch (kind) {
            .none => .none,
            .bottom => .bottom,
            .top => .top,
            .center => unreachable,
        };
        attributes = underline.attributes(attributes, mapped);
    };
    if (patch.underline_style) |style| attributes = (attributes & ~@as(u32, 15 << 4)) | (@as(u32, lines.hwp5(style)) << 4);
    if (patch.strike_style) |style| {
        const shift: u5 = if (legacy_strike) 4 else 26;
        attributes = (attributes & ~(@as(u32, 15) << shift)) | (@as(u32, lines.hwp5(style)) << shift);
    }
    std.mem.writeInt(u32, output[46..50], attributes, .little);
    if (patch.underline_color) |color| std.mem.writeInt(u32, output[56..60], @import("../../model/rgb_color.zig").hwp5(color), .little);
    if (patch.strike_color) |color| std.mem.writeInt(u32, output[strike_color_offset.?..][0..4], @import("../../model/rgb_color.zig").hwp5(color), .little);
    if (patch.text_color) |color| std.mem.writeInt(u32, output[52..56], @import("../../model/rgb_color.zig").hwp5(color), .little);
    if (patch.shade) |intent| std.mem.writeInt(u32, output[60..64], try @import("../../model/shade_color.zig").encodeHwp5(intent), .little);
    return output;
}

test "HWP5 character property payload strike preserves unrelated bytes and rejects unknown kinds" {
    const a = std.testing.allocator;
    var input: [74]u8 = @splat(0);
    std.mem.writeInt(u32, input[46..50], (15 << 26) | 2, .little);
    const output = try write(a, &input, .{ .raw = 0x05000300 }, .{ .strike_enabled = true, .italic = true }, 74);
    defer a.free(output);
    var expected = input;
    std.mem.writeInt(u32, expected[46..50], (15 << 26) | (1 << 18) | 3, .little);
    try std.testing.expectEqualSlices(u8, &expected, output);
    const disabled = try write(a, output, .{ .raw = 0x05000300 }, .{ .strike_enabled = false }, 74);
    defer a.free(disabled);
    expected[48] &= ~@as(u8, 4);
    try std.testing.expectEqualSlices(u8, &expected, disabled);
    for (2..8) |kind| {
        std.mem.writeInt(u32, input[46..50], @as(u32, @intCast(kind)) << 18, .little);
        try std.testing.expectError(error.UnsupportedCharacterStrikeKind, write(a, &input, .{ .raw = 0x05000300 }, .{ .strike_enabled = false }, 74));
    }
}

test "HWP5 character property payload preserves version tails and allocation failures" {
    const a = std.testing.allocator;
    const input: [79]u8 = @splat(0xa5);
    for ([_]u32{ 0x05000000, 0x05000201, 0x05000300, 0x05010000 }) |raw| {
        const output = try write(a, &input, .{ .raw = raw }, .{ .size = 1200, .bold = true, .italic = false }, 100);
        defer a.free(output);
        var expected = input;
        std.mem.writeInt(i32, expected[42..46], 1200, .little);
        expected[46] = 0xa6;
        try std.testing.expectEqualSlices(u8, &expected, output);
        const unchanged = try write(a, &input, .{ .raw = raw }, .{}, 100);
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, &input, unchanged);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const output = try write(allocator, source, .{ .raw = 0x05010000 }, .{ .size = 409600, .bold = false }, 100);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(i32, 409600), std.mem.readInt(i32, output[42..46], .little));
            try std.testing.expectEqualSlices(u8, source[50..], output[50..]);
        }
    }.run, .{&input});
    for ([_]i32{ -1, 409601 }) |size| try std.testing.expectError(error.InvalidCharacterSize, write(a, &input, .{ .raw = 0x05010000 }, .{ .size = size }, 100));
    try std.testing.expectError(error.UnexpectedEnd, write(a, input[0..65], .{ .raw = 0x05000000 }, .{}, 100));
    try std.testing.expectError(error.LimitExceeded, write(a, &input, .{ .raw = 0x05010000 }, .{}, 1));
}

test "HWP5 text color payload changes only its four bytes across versions" {
    const a = std.testing.allocator;
    const input: [79]u8 = @splat(0xa5);
    for ([_]u32{ 0x05000000, 0x05000201, 0x05000300, 0x05010000 }) |raw| {
        const output = try write(a, &input, .{ .raw = raw }, .{ .text_color = 0x123456 }, 100);
        defer a.free(output);
        var expected = input;
        std.mem.writeInt(u32, expected[52..56], 0x563412, .little);
        try std.testing.expectEqualSlices(u8, &expected, output);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const output = try write(allocator, source, .{ .raw = 0x05010000 }, .{ .text_color = 0 }, 100);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(u32, 0), std.mem.readInt(u32, output[52..56], .little));
            try std.testing.expectEqualSlices(u8, source[0..52], output[0..52]);
            try std.testing.expectEqualSlices(u8, source[56..], output[56..]);
        }
    }.run, .{&input});
}

test "HWP5 font payload changes only requested language across versions" {
    const a = std.testing.allocator;
    const input: [79]u8 = @splat(0xa5);
    for ([_]u32{ 0x05000000, 0x05000201, 0x05000300, 0x05010000 }) |raw| {
        for (0..7) |language| {
            var ids: @import("../../model/character_fonts.zig").Values = @splat(null);
            ids[language] = if (language % 2 == 0) 0 else 65535;
            const output = try write(a, &input, .{ .raw = raw }, .{ .font_ids = ids }, 100);
            defer a.free(output);
            var expected = input;
            std.mem.writeInt(u16, expected[language * 2 ..][0..2], @intCast(ids[language].?), .little);
            try std.testing.expectEqualSlices(u8, &expected, output);
            ids[language] = 65536;
            try std.testing.expectError(error.InvalidFontId, write(a, &input, .{ .raw = raw }, .{ .font_ids = ids }, 100));
        }
    }
}
