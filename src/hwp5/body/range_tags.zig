const Reader = @import("../../binary/reader.zig").Reader;
pub const Range = struct {
    start: u32,
    end: u32,
    tag: u32,
    pub fn kind(self: Range) u8 {
        return @truncate(self.tag >> 24);
    }
    pub fn data(self: Range) u24 {
        return @truncate(self.tag);
    }
    pub fn read(r: *Reader) !Range {
        return .{ .start = try r.readInt(u32), .end = try r.readInt(u32), .tag = try r.readInt(u32) };
    }
};
pub const Ranges = @import("../../binary/record_array.zig").Records(Range, 12);
