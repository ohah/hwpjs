const Reader = @import("../../binary/reader.zig").Reader;
/// Six-byte raw border fields. Enum interpretation belongs to the consuming context.
pub const Border = struct {
    kind: u8,
    width: u8,
    color: u32,
    pub fn read(reader: *Reader) !Border {
        var r = reader.*;
        const b: Border = .{ .kind = try r.readInt(u8), .width = try r.readInt(u8), .color = try r.readInt(u32) };
        reader.* = r;
        return b;
    }
};
