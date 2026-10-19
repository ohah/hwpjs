const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
pub const TypeInfoPolicy = enum { required, observed_short_hft };
pub const Substitute = struct { kind: u8, name_utf16: []const u8 };
pub const FaceName = struct {
    attributes: u8,
    name_utf16: []const u8,
    substitute: ?Substitute,
    /// Ten bytes in spec order (family, serif, weight, proportion, contrast,
    /// stroke variation, arm style, letterform, midline, x-height).
    type_info: ?[10]u8,
    unresolved_type_info: ?[]const u8 = null,
    default_utf16: ?[]const u8,
    extra: []const u8,

    pub fn parse(bytes: []const u8) !FaceName {
        return parseWithTypeInfoPolicy(bytes, .required);
    }

    pub fn parseWithTypeInfoPolicy(bytes: []const u8, policy: TypeInfoPolicy) !FaceName {
        var r: Reader = .{ .bytes = bytes };
        const attributes = try r.readInt(u8);
        const name = try string.read(&r);
        const substitute: ?Substitute = if (attributes & 0x80 != 0) .{ .kind = try r.readInt(u8), .name_utf16 = try string.read(&r) } else null;
        const remaining = bytes.len - r.offset;
        const unresolved = policy == .observed_short_hft and attributes == 0x42 and (remaining == 4 or remaining == 6);
        const unresolved_bytes = if (unresolved) try r.take(remaining) else null;
        const type_info = if (attributes & 0x40 != 0 and !unresolved) (try r.take(10))[0..10].* else null;
        const default = if (attributes & 0x20 != 0) try string.read(&r) else null;
        return .{ .attributes = attributes, .name_utf16 = name, .substitute = substitute, .type_info = type_info, .unresolved_type_info = unresolved_bytes, .default_utf16 = default, .extra = bytes[r.offset..] };
    }
};

test "observed short HFT type bytes remain unresolved and borrowed without padding" {
    const std = @import("std");
    var bytes = [_]u8{ 0x42, 1, 0, 65, 0 } ++ @as([10]u8, @splat(0));
    for (0..10) |length| {
        const input = bytes[0 .. 5 + length];
        try std.testing.expectError(error.UnexpectedEnd, FaceName.parse(input));
        if (length == 4 or length == 6) {
            const value = try FaceName.parseWithTypeInfoPolicy(input, .observed_short_hft);
            try std.testing.expect(value.type_info == null);
            try std.testing.expectEqualSlices(u8, input[5..], value.unresolved_type_info.?);
            try std.testing.expect(value.unresolved_type_info.?.ptr == input[5..].ptr);
            try std.testing.expectEqual(@as(usize, 0), value.extra.len);
        } else try std.testing.expectError(error.UnexpectedEnd, FaceName.parseWithTypeInfoPolicy(input, .observed_short_hft));
    }
    const full = try FaceName.parseWithTypeInfoPolicy(&bytes, .observed_short_hft);
    try std.testing.expect(full.type_info != null and full.unresolved_type_info == null);
    bytes[0] = 0x41;
    try std.testing.expectError(error.UnexpectedEnd, FaceName.parseWithTypeInfoPolicy(bytes[0..9], .observed_short_hft));
}
