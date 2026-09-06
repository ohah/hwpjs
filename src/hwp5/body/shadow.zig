const Reader = @import("../../binary/reader.zig").Reader;
/// Observed drawing shadow block, without applying rendering defaults.
pub const Shadow = struct {
    kind: u32,
    color: u32,
    offset_x: i32,
    offset_y: i32,
    pub fn read(reader: *Reader) !Shadow {
        var r = reader.*;
        const value: Shadow = .{ .kind = try r.readInt(u32), .color = try r.readInt(u32), .offset_x = try r.readInt(i32), .offset_y = try r.readInt(i32) };
        reader.* = r;
        return value;
    }
};
