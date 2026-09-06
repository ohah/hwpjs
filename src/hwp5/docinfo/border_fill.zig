const Reader = @import("../../binary/reader.zig").Reader;
pub const Fill = @import("fill.zig").Fill;
pub const Border = @import("border_line.zig").Border;
pub const BorderFill = struct {
    attributes: u16,
    /// Left, right, top, bottom, diagonal: interleaved six-byte entries.
    borders: [5]Border,
    fill: Fill,
    pub fn parse(bytes: []const u8) !BorderFill {
        var r: Reader = .{ .bytes = bytes };
        const attributes = try r.readInt(u16);
        var borders: [5]Border = undefined;
        for (&borders) |*b| b.* = try Border.read(&r);
        return .{ .attributes = attributes, .borders = borders, .fill = try Fill.parse(bytes[r.offset..]) };
    }
};
