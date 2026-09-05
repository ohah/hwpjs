const Reader = @import("../../binary/reader.zig").Reader;
/// Shared 12-byte numbering/bullet head. Preserve sentinel IDs and raw flags.
pub const Head = struct {
    attributes: u32,
    width_adjustment: i16,
    text_distance: i16,
    char_shape_id: u32,

    pub fn read(reader: *Reader) !Head {
        var r = reader.*;
        const result: Head = .{ .attributes = try r.readInt(u32), .width_adjustment = try r.readInt(i16), .text_distance = try r.readInt(i16), .char_shape_id = try r.readInt(u32) };
        reader.* = r;
        return result;
    }
};
