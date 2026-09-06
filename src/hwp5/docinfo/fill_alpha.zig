const Reader = @import("../../binary/reader.zig").Reader;
/// Observed per-type bytes following Fill's additional block. Do not merge zero with absence.
pub const Alpha = struct {
    pattern: ?u8,
    gradient: ?u8,
    image: ?u8,
    pub fn read(reader: *Reader, flags: u32) !Alpha {
        if (flags & ~@as(u32, 7) != 0) return error.UnsupportedFillKind;
        var r = reader.*;
        const value: Alpha = .{
            .pattern = if (flags & 1 != 0) try r.readInt(u8) else null,
            .gradient = if (flags & 4 != 0) try r.readInt(u8) else null,
            .image = if (flags & 2 != 0) try r.readInt(u8) else null,
        };
        reader.* = r;
        return value;
    }
};
