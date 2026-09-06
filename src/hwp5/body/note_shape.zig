const Reader = @import("../../binary/reader.zig").Reader;
pub const Layout = enum { observed28, spec26 };
pub const Shape = struct {
    flags: u32,
    user_char: u16,
    prefix: u16,
    suffix: u16,
    start_number: u16,
    separator_length: i32,
    above: i16,
    below: i16,
    between: i16,
    line_type: u8,
    line_width: u8,
    color: u32,
    layout: Layout,
    extra: []const u8,
    pub fn numberKind(self: Shape) u8 {
        return @truncate(self.flags);
    }
    pub fn placement(self: Shape) u2 {
        return @truncate(self.flags >> 8);
    }
    pub fn numbering(self: Shape) u2 {
        return @truncate(self.flags >> 10);
    }
    /// Observed HWP wire layout. Do not treat a truncated 28-byte record as spec26.
    pub fn parse(bytes: []const u8) !Shape {
        return parseLayout(bytes, .observed28);
    }
    /// Explicit spec26 decoding exists for specification-derived input, not auto-detection.
    pub fn parseLayout(bytes: []const u8, layout: Layout) !Shape {
        var r: Reader = .{ .bytes = bytes };
        var s: Shape = undefined;
        s.flags = try r.readInt(u32);
        s.user_char = try r.readInt(u16);
        s.prefix = try r.readInt(u16);
        s.suffix = try r.readInt(u16);
        s.start_number = try r.readInt(u16);
        s.separator_length = if (layout == .observed28) try r.readInt(i32) else try r.readInt(i16);
        s.above = try r.readInt(i16);
        s.below = try r.readInt(i16);
        s.between = try r.readInt(i16);
        s.line_type = try r.readInt(u8);
        s.line_width = try r.readInt(u8);
        s.color = try r.readInt(u32);
        s.layout = layout;
        s.extra = bytes[r.offset..];
        return s;
    }
};
