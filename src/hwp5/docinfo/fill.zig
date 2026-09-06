const Reader = @import("../../binary/reader.zig").Reader;
pub const Picture = @import("picture_info.zig").Picture;
pub const Pattern = struct { background: u32, foreground: u32, kind: i32 };
pub const Gradient = struct {
    kind: u8,
    angle: u32,
    center_x: u32,
    center_y: u32,
    blur: u32,
    /// Borrowed little-endian i32 positions (only when count > 2) and u32 colors.
    positions: []const u8,
    colors: []const u8,
    pub fn count(self: Gradient) usize {
        return self.colors.len / 4;
    }
    pub fn color(self: Gradient, index: usize) ?u32 {
        if (index >= self.count()) return null;
        var r: Reader = .{ .bytes = self.colors[index * 4 ..][0..4] };
        return r.readInt(u32) catch unreachable;
    }
    pub fn position(self: Gradient, index: usize) ?i32 {
        if (index >= self.positions.len / 4) return null;
        var r: Reader = .{ .bytes = self.positions[index * 4 ..][0..4] };
        return r.readInt(i32) catch unreachable;
    }
};
pub const Image = struct { mode: u8, picture: Picture };
pub const Known = struct {
    pattern: ?Pattern,
    gradient: ?Gradient,
    image: ?Image,
    /// Length-prefixed extension: gradient blur center is its first byte when present.
    additional: []const u8,
    extra: []const u8,
    pub fn blurCenter(self: Known) ?u8 {
        return if (self.gradient != null and self.additional.len == 1) self.additional[0] else null;
    }
};
pub const Fill = struct {
    flags: u32,
    data: union(enum) { known: Known, unknown: []const u8 },
    pub fn parse(bytes: []const u8) !Fill {
        var r: Reader = .{ .bytes = bytes };
        const flags = try r.readInt(u32);
        // Unknown type bits can change field ordering: preserve the whole tail.
        if (flags & ~@as(u32, 7) != 0) return .{ .flags = flags, .data = .{ .unknown = bytes[r.offset..] } };
        const pattern: ?Pattern = if (flags & 1 != 0) .{ .background = try r.readInt(u32), .foreground = try r.readInt(u32), .kind = try r.readInt(i32) } else null;
        var gradient: ?Gradient = null;
        if (flags & 4 != 0) {
            const kind = try r.readInt(u8);
            const angle = try r.readInt(u32);
            const x = try r.readInt(u32);
            const y = try r.readInt(u32);
            const blur = try r.readInt(u32);
            const n = try r.readInt(u32);
            const stride: usize = if (n > 2) 8 else 4;
            if (n > (bytes.len - r.offset) / stride) return error.UnexpectedEnd;
            const positions = try r.take(if (n > 2) @as(usize, n) * 4 else 0);
            const colors = try r.take(@as(usize, n) * 4);
            gradient = .{ .kind = kind, .angle = angle, .center_x = x, .center_y = y, .blur = blur, .positions = positions, .colors = colors };
        }
        const image: ?Image = if (flags & 2 != 0) .{ .mode = try r.readInt(u8), .picture = try Picture.read(&r) } else null;
        const size = try r.readInt(u32);
        const additional = try r.take(size);
        return .{ .flags = flags, .data = .{ .known = .{ .pattern = pattern, .gradient = gradient, .image = image, .additional = additional, .extra = bytes[r.offset..] } } };
    }
};
