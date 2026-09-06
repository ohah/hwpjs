const Reader = @import("../../binary/reader.zig").Reader;
/// The spec and observed wire layouts cannot be distinguished by length/version alone.
pub const Layout = enum { spec6, observed8 };
pub const View = struct {
    attributes: u32,
    unknown: ?u16,
    extra: []const u8,
    pub fn direction(self: View) u3 {
        return @truncate(self.attributes);
    }
    pub fn wrapping(self: View) u2 {
        return @truncate(self.attributes >> 3);
    }
    pub fn alignment(self: View) u2 {
        return @truncate(self.attributes >> 5);
    }
};
pub const Header = struct {
    count_raw: u16,
    tail: []const u8,
    pub fn parse(bytes: []const u8) !Header {
        var r: Reader = .{ .bytes = bytes };
        _ = try r.take(6);
        r.offset = 0;
        return .{ .count_raw = try r.readInt(u16), .tail = bytes[2..] };
    }
    pub fn signedCount(self: Header) i16 {
        return @bitCast(self.count_raw);
    }
    /// Selection belongs to the owning control/schema, not a guessed fallback.
    pub fn view(self: Header, layout: Layout) !View {
        var r: Reader = .{ .bytes = self.tail };
        const unknown = if (layout == .observed8) try r.readInt(u16) else null;
        const attributes = try r.readInt(u32);
        return .{ .attributes = attributes, .unknown = unknown, .extra = self.tail[r.offset..] };
    }
};
