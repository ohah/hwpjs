const Reader = @import("../../binary/reader.zig").Reader;
const rules = @import("control_rules.zig");
pub const HideLayout = enum { spec16, observed32 };
pub const Target = enum(u32) { header = 1, footer = 2, master_page = 4, border = 8, background = 16, page_number = 32 };
pub const Hide = struct {
    attributes: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8, layout: HideLayout) !Hide {
        var r: Reader = .{ .bytes = bytes };
        const attributes = switch (layout) {
            .spec16 => try r.readInt(u16),
            .observed32 => try r.readInt(u32),
        };
        return .{ .attributes = attributes, .extra = bytes[r.offset..] };
    }
    pub fn hides(self: Hide, target: Target) bool {
        return self.attributes & @intFromEnum(target) != 0;
    }
    pub fn unknownBits(self: Hide) u32 {
        return self.attributes & ~@as(u32, 63);
    }
};
pub const Parity = struct {
    attributes: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Parity {
        var r: Reader = .{ .bytes = bytes };
        return .{ .attributes = try r.readInt(u32), .extra = bytes[r.offset..] };
    }
    pub fn kind(self: Parity) u2 {
        return @truncate(self.attributes);
    }
};
pub const Value = union(enum) { hide: Hide, parity: Parity };
pub fn parse(id: u32, bytes: []const u8, layout: HideLayout) !?Value {
    if (id == rules.id("pghd")) return .{ .hide = try Hide.parse(bytes, layout) };
    if (id == rules.id("pgct")) return .{ .parity = try Parity.parse(bytes) };
    return null;
}
