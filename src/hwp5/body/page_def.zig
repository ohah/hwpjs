const Reader = @import("../../binary/reader.zig").Reader;
const std = @import("std");
pub const Orientation = enum { narrowly, widely };
pub const Binding = enum { one_side, facing, top };
pub const Definition = struct {
    width: u32,
    height: u32,
    left: u32,
    right: u32,
    top: u32,
    bottom: u32,
    header: u32,
    footer: u32,
    gutter: u32,
    flags: u32,
    extra: []const u8,
    /// Table 132: retain unknown flags in raw flags; do not invent geometry.
    pub fn orientation(self: Definition) Orientation {
        return if (self.flags & 1 == 0) .narrowly else .widely;
    }
    pub fn binding(self: Definition) !Binding {
        return switch ((self.flags >> 1) & 3) {
            0 => .one_side,
            1 => .facing,
            2 => .top,
            else => error.UnsupportedPageBinding,
        };
    }
    pub fn parse(bytes: []const u8) !Definition {
        var r: Reader = .{ .bytes = bytes };
        var d: Definition = undefined;
        inline for (.{ "width", "height", "left", "right", "top", "bottom", "header", "footer", "gutter", "flags" }) |name| @field(d, name) = try r.readInt(u32);
        d.extra = bytes[r.offset..];
        return d;
    }
};

test "HWP5 page definition flags all binding orientation combinations preserve unknown bits" {
    var bytes: [43]u8 = @splat(0);
    bytes[40..43].* = .{ 0xaa, 0xbb, 0xcc };
    for (0..8) |low| {
        const flags = @as(u32, 0xfffffff8) | @as(u32, @intCast(low));
        std.mem.writeInt(u32, bytes[36..40], flags, .little);
        const page = try Definition.parse(&bytes);
        try std.testing.expectEqual(flags, page.flags);
        try std.testing.expectEqualSlices(u8, bytes[40..], page.extra);
        try std.testing.expectEqual(if (low & 1 == 0) Orientation.narrowly else Orientation.widely, page.orientation());
        if (low >> 1 == 3) {
            try std.testing.expectError(error.UnsupportedPageBinding, page.binding());
        } else {
            const expected = [_]Binding{ .one_side, .facing, .top };
            try std.testing.expectEqual(expected[low >> 1], try page.binding());
        }
    }
    for (0..40) |length| try std.testing.expectError(error.UnexpectedEnd, Definition.parse(bytes[0..length]));
}
