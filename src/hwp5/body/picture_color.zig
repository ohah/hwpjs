const Reader = @import("../../binary/reader.zig").Reader;
pub const Effects = @import("picture_color_effect.zig").Effects;
/// Observed type 0 has a four-byte value. Other type-to-width mappings are unverified.
pub const Color = struct {
    type_raw: i32,
    value_raw: u32,
    effects: Effects,
    /// Atomic bounded read: unknown types and truncated arrays never advance the caller.
    pub fn read(reader: *Reader) !Color {
        var r = reader.*;
        const kind = try r.readInt(i32);
        if (kind != 0) return error.UnsupportedPictureColorType;
        const value = try r.readInt(u32);
        const count = try r.readInt(u32);
        if (count > (r.bytes.len - r.offset) / 8) return error.UnexpectedEnd;
        const effects = try Effects.parse(try r.take(@as(usize, count) * 8));
        reader.* = r;
        return .{ .type_raw = kind, .value_raw = value, .effects = effects };
    }
};
