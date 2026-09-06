const Reader = @import("../../binary/reader.zig").Reader;
pub const fields = @import("picture_effect_fields.zig");
const Color = @import("picture_color.zig").Color;
pub const Shadow = struct { properties: fields.Shadow, color: Color };
pub const Neon = struct { properties: fields.Neon, color: Color };
pub const Effects = struct {
    flags: u32,
    shadow: ?Shadow,
    neon: ?Neon,
    soft_edge_radius_bits: ?u32,
    reflection: ?fields.Reflection,
    /// Atomic: unknown flags/types cannot silently shift following properties.
    pub fn read(reader: *Reader) !Effects {
        var r = reader.*;
        const flags = try r.readInt(u32);
        if (flags & ~@as(u32, 15) != 0) return error.UnsupportedPictureEffects;
        const shadow: ?Shadow = if (flags & 1 != 0) .{ .properties = try fields.read(fields.Shadow, &r), .color = try Color.read(&r) } else null;
        const neon: ?Neon = if (flags & 2 != 0) .{ .properties = try fields.read(fields.Neon, &r), .color = try Color.read(&r) } else null;
        const soft = if (flags & 4 != 0) try r.readInt(u32) else null;
        const reflection = if (flags & 8 != 0) try fields.read(fields.Reflection, &r) else null;
        reader.* = r;
        return .{ .flags = flags, .shadow = shadow, .neon = neon, .soft_edge_radius_bits = soft, .reflection = reflection };
    }
};
