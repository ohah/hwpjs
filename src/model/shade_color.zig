//! Shade intent distinguishes explicit none, RGB, and unknown source values.
const std = @import("std");
const rgb = @import("rgb_color.zig");

pub const Value = union(enum) { none, color: u32, unknown };
pub const Intent = union(enum) { none, color: u32 };

pub fn encodeHwp5(intent: Intent) !u32 {
    return switch (intent) {
        .none => 0xffffffff,
        .color => |value| blk: {
            try rgb.validate(value);
            break :blk rgb.hwp5(value);
        },
    };
}

pub fn formatXml(a: std.mem.Allocator, intent: Intent) ![]u8 {
    return switch (intent) {
        .none => a.dupe(u8, "#FFFFFFFF"),
        .color => |value| rgb.format(a, value),
    };
}

pub fn hwp5(raw: u32) Value {
    if (raw == 0xffffffff) return .none;
    if (raw > 0xffffff) return .unknown;
    return .{ .color = rgb.hwp5(raw) };
}

pub fn xml(raw: []const u8) Value {
    if (std.ascii.eqlIgnoreCase(raw, "#FFFFFFFF")) return .none;
    if (rgb.xml(raw)) |value| return .{ .color = value };
    return .unknown;
}

test "shade source distinguishes none white black and unknown without defaults" {
    try std.testing.expectEqualDeep(Value.none, hwp5(0xffffffff));
    try std.testing.expectEqualDeep(Value.none, xml("#FFFFFFFF"));
    try std.testing.expectEqualDeep(Value.none, xml("#ffffffff"));
    for ([_]u32{ 0, 0xffffff, 0x123456 }) |value| {
        try std.testing.expectEqualDeep(Value{ .color = value }, hwp5(rgb.hwp5(value)));
        const text = try rgb.format(std.testing.allocator, value);
        defer std.testing.allocator.free(text);
        try std.testing.expectEqualDeep(Value{ .color = value }, xml(text));
    }
    for ([_]u32{ 0x01000000, 0xff000000, 0xfffffffe }) |raw| try std.testing.expectEqualDeep(Value.unknown, hwp5(raw));
    for ([_][]const u8{ "", "none", "#FFFFFFF", "#FFFFFFFFF", "#gggggg", " #FFFFFFFF" }) |raw| try std.testing.expectEqualDeep(Value.unknown, xml(raw));
}

test "shade intent round trips none and white independently and rejects oversized RGB" {
    const a = std.testing.allocator;
    for ([_]Intent{ .none, .{ .color = 0 }, .{ .color = 0xffffff }, .{ .color = 0x123456 } }) |intent| {
        const text = try formatXml(a, intent);
        defer a.free(text);
        try std.testing.expectEqualDeep(hwp5(try encodeHwp5(intent)), xml(text));
    }
    try std.testing.expectEqual(@as(u32, 0xffffffff), try encodeHwp5(.none));
    try std.testing.expectEqual(@as(u32, 0xffffff), try encodeHwp5(.{ .color = 0xffffff }));
    try std.testing.expectError(error.InvalidCharacterColor, encodeHwp5(.{ .color = 0xffffffff }));
    try std.testing.expectError(error.InvalidCharacterColor, formatXml(a, .{ .color = 0x1000000 }));
}
