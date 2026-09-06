const Reader = @import("../../binary/reader.zig").Reader;
pub const Fill = @import("fill.zig").Fill;
pub const Border = struct { kind: u8, width: u8, color: u32 };
pub const BorderFill = struct {
    attributes: u16,
    /// Left, right, top, bottom, diagonal: interleaved six-byte entries.
    borders: [5]Border,
    fill: Fill,
    pub fn parse(bytes: []const u8) !BorderFill {
        var r: Reader = .{ .bytes = bytes };
        const attributes = try r.readInt(u16);
        var borders: [5]Border = undefined;
        for (&borders) |*b| b.* = .{ .kind = try r.readInt(u8), .width = try r.readInt(u8), .color = try r.readInt(u32) };
        return .{ .attributes = attributes, .borders = borders, .fill = try Fill.parse(bytes[r.offset..]) };
    }
};
