const Reader = @import("../../binary/reader.zig").Reader;
const Version = @import("../version.zig").Version;
pub const TailPolicy = enum { required, observed_unresolved_four_bytes };
pub const CharShape = struct {
    pub const attributes_offset: usize = 46;
    pub const underline_color_offset: usize = 56;
    pub const base_size: usize = 68;
    pub const border_fill_offset: usize = 68;
    pub const strike_color_offset: usize = 70;
    pub const independent_strike_size: usize = 74;
    font_ids: [7]u16,
    ratios: [7]u8,
    spacing: [7]i8,
    relative_sizes: [7]u8,
    offsets: [7]i8,
    size: i32,
    attributes: u32,
    shadow_x: i8,
    shadow_y: i8,
    text_color: u32,
    underline_color: u32,
    shade_color: u32,
    shadow_color: u32,
    border_fill_id: ?u16,
    strike_color: ?u32,
    unresolved_tail: ?[]const u8 = null,
    extra: []const u8,
    pub fn outlineKindRaw(self: CharShape) u3 {
        return @truncate(self.attributes >> 8);
    }
    pub fn shadowKindRaw(self: CharShape) u2 {
        return @truncate(self.attributes >> 11);
    }
    pub fn embossed(self: CharShape) bool {
        return self.attributes & (1 << 13) != 0;
    }
    pub fn engraved(self: CharShape) bool {
        return self.attributes & (1 << 14) != 0;
    }
    pub fn superscript(self: CharShape) bool {
        return self.attributes & (1 << 15) != 0;
    }
    pub fn subscript(self: CharShape) bool {
        return self.attributes & (1 << 16) != 0;
    }
    // Preserve raw values, including the undocumented kind 2; do not map it to top.
    pub fn underlineKindRaw(self: CharShape) u2 {
        return @truncate(self.attributes >> 2);
    }
    pub fn underlineStyleRaw(self: CharShape) u4 {
        return @truncate(self.attributes >> 4);
    }
    pub fn strikeKindRaw(self: CharShape) u3 {
        return @truncate(self.attributes >> 18);
    }
    pub fn strikeStyleRaw(self: CharShape) u4 {
        return @truncate(self.attributes >> 26);
    }
    pub fn parse(bytes: []const u8, version: Version) !CharShape {
        return parseWithTailPolicy(bytes, version, .required);
    }

    pub fn parseWithTailPolicy(bytes: []const u8, version: Version, policy: TailPolicy) !CharShape {
        try version.requireSupported();
        var r: Reader = .{ .bytes = bytes };
        var v: CharShape = undefined;
        for (&v.font_ids) |*x| x.* = try r.readInt(u16);
        for (&v.ratios) |*x| x.* = try r.readInt(u8);
        for (&v.spacing) |*x| x.* = try r.readInt(i8);
        for (&v.relative_sizes) |*x| x.* = try r.readInt(u8);
        for (&v.offsets) |*x| x.* = try r.readInt(i8);
        v.size = try r.readInt(i32);
        @import("std").debug.assert(r.offset == attributes_offset);
        v.attributes = try r.readInt(u32);
        v.shadow_x = try r.readInt(i8);
        v.shadow_y = try r.readInt(i8);
        v.text_color = try r.readInt(u32);
        @import("std").debug.assert(r.offset == underline_color_offset);
        v.underline_color = try r.readInt(u32);
        v.shade_color = try r.readInt(u32);
        v.shadow_color = try r.readInt(u32);
        @import("std").debug.assert(r.offset == base_size);
        v.unresolved_tail = null;
        if (policy == .observed_unresolved_four_bytes and version.raw >= 0x05000300 and bytes.len - r.offset == 4) {
            v.unresolved_tail = try r.take(4);
            v.border_fill_id = null;
            v.strike_color = null;
            v.extra = bytes[r.offset..];
            return v;
        }
        v.border_fill_id = if (version.raw >= 0x05000201 and r.offset < bytes.len) try r.readInt(u16) else null;
        v.strike_color = if (version.raw >= 0x05000300 and r.offset < bytes.len) try r.readInt(u32) else null;
        v.extra = bytes[r.offset..];
        return v;
    }
};

test "observed character tail preserves four unresolved bytes without inventing border or strike" {
    const std = @import("std");
    const bytes = @as([74]u8, @splat(0));
    const version: Version = .{ .raw = 0x05000300 };
    try std.testing.expectError(error.UnexpectedEnd, CharShape.parse(bytes[0..72], version));
    const shape = try CharShape.parseWithTailPolicy(bytes[0..72], version, .observed_unresolved_four_bytes);
    try std.testing.expect(shape.border_fill_id == null and shape.strike_color == null);
    try std.testing.expectEqual(@as(usize, 4), shape.unresolved_tail.?.len);
    try std.testing.expect(shape.unresolved_tail.?.ptr == bytes[68..].ptr);
    for ([_]usize{ 69, 71, 73 }) |length| try std.testing.expectError(error.UnexpectedEnd, CharShape.parseWithTailPolicy(bytes[0..length], version, .observed_unresolved_four_bytes));
    const complete = try CharShape.parseWithTailPolicy(&bytes, version, .observed_unresolved_four_bytes);
    try std.testing.expect(complete.unresolved_tail == null);
    try std.testing.expectEqual(@as(?u16, 0), complete.border_fill_id);
    try std.testing.expectEqual(@as(?u32, 0), complete.strike_color);
}

test "HWP5 character effects preserve reserved kinds conflicting scripts and neighboring bits" {
    const std = @import("std");
    const mask: u32 = 0x1ff00;
    for (0..512) |effect_bits| {
        var bytes: [68]u8 = @splat(0);
        const bits: u32 = @intCast(effect_bits);
        const attributes = (0xa5a55a5a & ~mask) | (bits << 8);
        std.mem.writeInt(u32, bytes[46..50], attributes, .little);
        const before = bytes;
        const shape = try CharShape.parse(&bytes, .{ .raw = 0x05000000 });
        try std.testing.expectEqual(@as(u3, @truncate(bits)), shape.outlineKindRaw());
        try std.testing.expectEqual(@as(u2, @truncate(bits >> 3)), shape.shadowKindRaw());
        try std.testing.expectEqual(bits & 32 != 0, shape.embossed());
        try std.testing.expectEqual(bits & 64 != 0, shape.engraved());
        try std.testing.expectEqual(bits & 128 != 0, shape.superscript());
        try std.testing.expectEqual(bits & 256 != 0, shape.subscript());
        try std.testing.expectEqual(attributes, shape.attributes);
        try std.testing.expectEqualSlices(u8, &before, &bytes);
    }
}

test "HWP5 strike raw fields preserve all values and neighboring attribute bits" {
    const std = @import("std");
    const mask: u32 = (7 << 18) | (15 << 26);
    for (0..8) |kind| for (0..16) |style| {
        var bytes: [68]u8 = @splat(0);
        const attributes: u32 = (0xa5a55a5a & ~mask) | (@as(u32, @intCast(kind)) << 18) | (@as(u32, @intCast(style)) << 26);
        std.mem.writeInt(u32, bytes[46..50], attributes, .little);
        const before = bytes;
        const shape = try CharShape.parse(&bytes, .{ .raw = 0x05000000 });
        try std.testing.expectEqual(@as(u3, @intCast(kind)), shape.strikeKindRaw());
        try std.testing.expectEqual(@as(u4, @intCast(style)), shape.strikeStyleRaw());
        try std.testing.expectEqual(attributes, shape.attributes);
        try std.testing.expectEqualSlices(u8, &before, &bytes);
        try std.testing.expectEqual(@as(?u32, null), shape.strike_color);
    };
}

test "HWP5 character underline raw fields preserve unknown values and surrounding bits" {
    const std = @import("std");
    for (0..4) |kind| for (0..16) |style| {
        var bytes: [68]u8 = @splat(0);
        const attributes = (@as(u32, 0xa5a5a503) & ~@as(u32, 0xfc)) |
            (@as(u32, @intCast(kind)) << 2) | (@as(u32, @intCast(style)) << 4);
        std.mem.writeInt(u32, bytes[46..50], attributes, .little);
        std.mem.writeInt(u32, bytes[56..60], 0x12345678, .little);
        const shape = try CharShape.parse(&bytes, .{ .raw = 0x05000000 });
        try std.testing.expectEqual(@as(u2, @intCast(kind)), shape.underlineKindRaw());
        try std.testing.expectEqual(@as(u4, @intCast(style)), shape.underlineStyleRaw());
        try std.testing.expectEqual(attributes, shape.attributes);
        try std.testing.expectEqual(@as(u32, 0x12345678), shape.underline_color);
    };
}
