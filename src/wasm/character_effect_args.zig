const Patch = @import("../model/document.zig").CharacterPropertyPatch;
pub fn decode(kind: u32, enabled: u32) !Patch {
    if (enabled > 1) return error.InvalidCharacterEffect;
    const value = enabled == 1;
    return switch (kind) {
        0 => .{ .emboss = value },
        1 => .{ .engrave = value },
        2 => .{ .superscript = value },
        3 => .{ .subscript = value },
        else => error.InvalidCharacterEffect,
    };
}
pub fn decodeExclusive(kind: u32, enabled: u32) !Patch {
    var patch = try decode(kind, enabled);
    if (enabled == 1) switch (kind) {
        0 => patch.engrave = false,
        1 => patch.emboss = false,
        2 => patch.subscript = false,
        3 => patch.superscript = false,
        else => unreachable,
    };
    return patch;
}
test "exclusive effects clear only the paired flag when enabling" {
    const std = @import("std");
    inline for (.{ .{ "emboss", "engrave" }, .{ "engrave", "emboss" }, .{ "superscript", "subscript" }, .{ "subscript", "superscript" } }, 0..) |names, kind| {
        var expected: Patch = .{};
        @field(expected, names[0]) = true;
        @field(expected, names[1]) = false;
        try std.testing.expectEqualDeep(expected, try decodeExclusive(kind, 1));
        expected = .{};
        @field(expected, names[0]) = false;
        try std.testing.expectEqualDeep(expected, try decodeExclusive(kind, 0));
    }
    try std.testing.expectError(error.InvalidCharacterEffect, decodeExclusive(4, 1));
    try std.testing.expectError(error.InvalidCharacterEffect, decodeExclusive(0, 2));
}
test "effect ABI preserves false true and rejects unknown codes" {
    const std = @import("std");
    inline for (.{ "emboss", "engrave", "superscript", "subscript" }, 0..) |name, kind| {
        for (0..2) |value| try std.testing.expectEqual(@as(?bool, value == 1), @field(try decode(kind, @intCast(value)), name));
    }
    try std.testing.expectError(error.InvalidCharacterEffect, decode(4, 0));
    try std.testing.expectError(error.InvalidCharacterEffect, decode(0, 2));
}
