const Reader = @import("../../binary/reader.zig").Reader;
const rules = @import("control_rules.zig");
pub const Header = struct {
    attributes: u32,
    number: u16,
    pub fn read(r: *Reader) !Header {
        var candidate = r.*;
        const value: Header = .{ .attributes = try candidate.readInt(u32), .number = try candidate.readInt(u16) };
        r.* = candidate;
        return value;
    }
    pub fn kind(self: Header) u4 {
        return @truncate(self.attributes);
    }
};
pub const Auto = struct {
    header: Header,
    symbol: u16,
    prefix: u16,
    suffix: u16,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Auto {
        var r: Reader = .{ .bytes = bytes };
        return .{ .header = try Header.read(&r), .symbol = try r.readInt(u16), .prefix = try r.readInt(u16), .suffix = try r.readInt(u16), .extra = bytes[r.offset..] };
    }
    pub fn shape(self: Auto) u8 {
        return @truncate(self.header.attributes >> 4);
    }
    pub fn superscript(self: Auto) bool {
        return self.header.attributes & 0x1000 != 0;
    }
};
pub const Restart = struct {
    header: Header,
    extra: []const u8,
    /// Table 144 fields sum to six bytes despite its stated total eight.
    /// Preserve remaining bytes; do not invent a padding field or widen the number.
    pub fn parse(bytes: []const u8) !Restart {
        var r: Reader = .{ .bytes = bytes };
        return .{ .header = try Header.read(&r), .extra = bytes[r.offset..] };
    }
};
pub const Value = union(enum) { auto: Auto, restart: Restart };
pub fn parse(id: u32, bytes: []const u8) !?Value {
    if (id == rules.id("atno")) return .{ .auto = try Auto.parse(bytes) };
    if (id == rules.id("nwno")) return .{ .restart = try Restart.parse(bytes) };
    return null;
}
