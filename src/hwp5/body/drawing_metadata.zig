const Reader = @import("../../binary/reader.zig").Reader;
/// Observed six-byte drawing suffix. Identity/opacity semantics are not inferred.
pub const Metadata = struct {
    instance_id: u32,
    reserved: u8,
    shadow_alpha: u8,
    pub fn read(reader: *Reader) !Metadata {
        var r = reader.*;
        const value: Metadata = .{
            .instance_id = try r.readInt(u32),
            .reserved = try r.readInt(u8),
            .shadow_alpha = try r.readInt(u8),
        };
        reader.* = r;
        return value;
    }
};
