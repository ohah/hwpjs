const Reader = @import("../../binary/reader.zig").Reader;
/// Wire order follows hwplib; raw signed adjustments are not normalized.
pub const Picture = struct {
    contrast: i8,
    brightness: i8,
    effect: u8,
    bin_data_id: u16,
    pub fn read(reader: *Reader) !Picture {
        var r = reader.*;
        const p: Picture = .{ .contrast = try r.readInt(i8), .brightness = try r.readInt(i8), .effect = try r.readInt(u8), .bin_data_id = try r.readInt(u16) };
        reader.* = r;
        return p;
    }
};
